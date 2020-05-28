"use strict";

const cluster = require("cluster");
const EventEmitter = require("events");
const numCPUs = require("os").cpus().length;
const equal = require("deep-equal");
const { Pool: InternalPool } = require("./pool");

const removeItem = (list, item) => {
    for (let idx = 0; idx < list.length; idx++) {
        if (equal(list[idx], item)) {
            list.splice(idx, 1);
            break;
        }
    }
}

class Pool extends EventEmitter {

    constructor (hndl, iter, opts = {}) {
        super();
        this.isClosed = false;
        this.handler(hndl);
        this.iterator(iter);
        this.options(opts);
    }

    handler (hndl) {
        this._handler = hndl;
        return this;
    }

    iterator (iter) {
        if (iter === undefined) {
            return this;

        } else if (typeof(iter) === "function") {
            this._iterator = iter();

        } else if (iter.toString().includes("Generator")) {
            this._iterator = iter;

        } else {
            this._iterator = (function* (iter) {
                for (const it of iter) {
                    yield it;
                }
            })(iter)
        }
        return this;
    }

    options ({ workers = numCPUs, threads = numCPUs, retries = 0, ha = false }) {
        this._workersNumber = workers;
        this._threadsNumber = threads;
        this._retries = retries;
        this._ha = ha;
        return this;
    }

    async run () {
        if (this._workersNumber && cluster.isMaster) {

            for (let i = 0; i < this._workersNumber; i++) {

                const worker = cluster.fork();
                worker.weight = 0;
                if (this._ha) {
                    worker.tasks = [];
                    this._workerOnExit(worker);
                }
                this._workerOnMessage(worker);
            }

            let next = await this._iterator.next();

            while (!next.done) {
                let { args, weight = 1, retries } = next.value;
                retries = retries == undefined ? this._retries : retries;

                const worker = this._lessLoadedWorker();
                if (this._ha) {
                    worker.tasks.push({ args, weight, retries });
                }
                worker.weight += weight;
                worker.send({ args, weight, retries });

                next = await this._iterator.next();
            }

        } else {

            this._pool = new InternalPool(this._threadsNumber);

            if (cluster.isWorker) {

                this._pool.on("error", o => {
                    process.send(o);
                });

                this._pool.on("success", o => {
                    process.send(o);
                });

                process.on("message", ({ args, weight, retries }) => {
                    this._pool.add(this._handler, args, weight, retries);
                });

            } else {

                this._pool.on("error", o => {
                    this.emit("error", o);
                });

                this._pool.on("success", o => {
                    this.emit("success", o);
                });

                let next = await this._iterator.next();

                while (!next.done) {
                    let { args, weight = 1, retries } = next.value;
                    retries = retries == undefined ? this._retries : retries;

                    this._pool.add(this._handler, args, weight, retries);
                    next = await this._iterator.next();
                }
            }
        }
    }

    async wait (timeout = null, pollingTime = 100) {
        if (cluster.isWorker) {
            return;
        }

        const start = new Date();

        if (this._workersNumber) {

            await new Promise((resolve, reject) => {
                const timerId = setInterval(() => {

                    let worker, isFinished = true;
                    for (worker of Object.values(cluster.workers)) {
                        if (worker.weight > 0) {
                            isFinished = false;
                            break;
                        }
                    }
    
                    if (isFinished) {
                        clearInterval(timerId);
                        this.isClosed = true;

                        for (worker of Object.values(cluster.workers)) {
                            worker.kill();
                        }

                        resolve();
                        return;
                    }

                    if (timeout != null && (new Date() - start > timeout)) {
                        clearTimeout(timerId);
                        this.isClosed = true;

                        for (worker of Object.values(cluster.workers)) {
                            worker.kill();
                        }

                        reject(Error(`Timeout ${timeout} ms has expired`));
                        return;
                    }
                }, pollingTime);
            });

        } else {
            await this._pool.wait(timeout, pollingTime);
            this.isClosed = true;
        }
    }

    _lessLoadedWorker () {
        const workers = Object.values(cluster.workers)
        let worker = workers[0];

        if (worker.weight > 0 && workers.length > 1) {
            for (const w of workers) {
                if (w.weight < worker.weight) {
                    worker = w;
                }
            }
        }
        return worker;
    }

    _workerOnMessage (worker) {
        worker.on("message", o => {

            if (this._ha) {
                removeItem(worker.tasks, {
                    args: o.args,
                    weight: o.weight,
                    retries: o.retries,
                });
            }
            worker.weight -= o.weight;

            if (o.error !== undefined) {
                this.emit("error", o);
            }

            if (o.result !== undefined) {
                this.emit("success", o);
            }
        });
    }

    _workerOnExit (worker) {
        worker.on("exit", () => {
            if (worker.weight && !this.isClosed) {

                const newWorker = cluster.fork();
                newWorker.weight = worker.weight;
                newWorker.tasks = worker.tasks;

                this._workerOnExit(newWorker);
                this._workerOnMessage(newWorker);


                for (const task of newWorker.tasks) {
                    newWorker.send(task);
                }
            }
        });
    }
}

module.exports = {
    Pool,
}
