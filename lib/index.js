"use strict";

const cluster = require("cluster");
const EventEmitter = require("events");
const numCPUs = require("os").cpus().length;
const equal = require("deep-equal");
const { Pool: InternalPool } = require("./pool");

const removeItem = (list, item) => {
    const list_length = list.length; // in order to not ask property each iteration in cycle
    for (let idx = 0; idx < list_length; idx++) {
        if (equal(list[idx], item)) {
            list.splice(idx, 1); // removes element by index from array
            return;
        }
    }
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const coma = async () => {
    while (true) {
        await sleep(2147483647); // max timer value
    }
}

class Pool extends EventEmitter {

    constructor (hndl, iter, opts = {}) {
        super();
        this.isClosed = false; // when true pool is finished and can't be used
        this.handler(hndl);
        this.iterator(iter);
        this.options(opts);
    }

    handler (hndl) {
        this._taskHandler = hndl;
        return this;
    }

    iterator (iter) {
        if (iter === undefined) { // used in builder pattern
            return this;

        } else if (typeof(iter) === "function") { // generator function is expected
            this._taskArgsIterator = iter();

        } else if (iter.toString().includes("Generator")) { // if generator object
            this._taskArgsIterator = iter;

        } else { // wrap to generator if it is sequence
            this._taskArgsIterator = (function* (iter) {
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
        this._taskRetries = retries;
        this._isHA = ha; // with high-availability workers will be respawned on death
        return this;
    }

    async run () {
        if (this._workersNumber && (cluster.isMaster || cluster.isPrimary)) {

            for (let i = 0; i < this._workersNumber; i++) {

                const worker = cluster.fork();
                worker.weight = 0; // is used for tasks balancing between workers and to detected finished worker
                if (this._isHA) {
                    worker.tasks = []; // is used for tasks reassigning in high-availability mode
                    this._workerOnExit(worker);
                }
                this._workerOnMessage(worker);
            }

            let it = await this._taskArgsIterator.next();

            while (!it.done) {
                let { args: taskArgs, weight: taskWeight = 1, retries: taskRetries } = it.value;
                taskRetries = taskRetries == undefined ? this._taskRetries : taskRetries;

                const worker = this._lessLoadedWorker();
                if (this._isHA) {
                    worker.tasks.push({ taskArgs, taskWeight, taskRetries });
                }
                worker.weight += taskWeight;
                worker.send({ taskArgs, taskWeight, taskRetries });

                it = await this._taskArgsIterator.next();
            }

        } else {

            this._pool = new InternalPool(this._threadsNumber);

            if (cluster.isWorker) {

                this._pool.on("error", task => {
                    process.send(task); // notify master about error
                });

                this._pool.on("success", task => {
                    process.send(task); // notify master about success
                });

                process.on("message", ({ taskArgs, taskWeight, taskRetries }) => { // receive task from master
                    this._pool.add(this._taskHandler, taskArgs, taskWeight, taskRetries);
                });

                await coma();

            } else { // if no workers to spawn just execute tasks in main process

                this._pool.on("error", task => {
                    this.emit("error", task);
                });

                this._pool.on("success", task => {
                    this.emit("success", task);
                });

                let it = await this._taskArgsIterator.next();

                while (!it.done) {
                    let { args: taskArgs, weight: taskWeight = 1, retries: taskRetries } = it.value;
                    taskRetries = taskRetries == undefined ? this._taskRetries : taskRetries;

                    this._pool.add(this._taskHandler, taskArgs, taskWeight, taskRetries);
                    it = await this._taskArgsIterator.next();
                }
            }
        }
    }

    async wait (timeout = null, pollingTime = 100) {
        if (cluster.isWorker) {
            return; // in worker wait for nothing, it's master issue to wait for tasks finishing
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

        } else { // if no workers just wait for internal pool finishing
            await this._pool.wait(timeout, pollingTime);
            this.isClosed = true;
        }
    }

    _lessLoadedWorker () {
        const workers = Object.values(cluster.workers);
        let lessLoadedWorker = workers[0];

        if (lessLoadedWorker.weight > 0 && workers.length > 1) {
            for (const worker of workers) {
                if (worker.weight < lessLoadedWorker.weight) {
                    lessLoadedWorker = worker;
                }
            }
        }
        return lessLoadedWorker;
    }

    _workerOnMessage (worker) {
        worker.on("message", task => {

            if (this._isHA) {
                removeItem(worker.tasks, {
                    taskArgs: task.args,
                    taskWeight: task.weight,
                    taskRetries: task.retries,
                });
            }
            worker.weight -= task.weight;

            if (task.error !== undefined) {
                this.emit("error", task);
            }

            if (task.result !== undefined) {
                this.emit("success", task);
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
                    newWorker.send(task); // send not finished tasks to new worker
                }
            }
        });
    }
}

module.exports = {
    Pool,
}
