const cluster = require("cluster");
const EventEmitter = require("events");
const numCPUs = require('os').cpus().length;

const { Pool: InternalPool } = require("./pool");

class Pool extends EventEmitter {

    constructor (hndl, iter, opts = {}) {
        super();
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

        } else if (typeof(iter) === 'function') {
            this._iterator = iter();

        } else if (iter.toString().includes('Generator')) {
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

    options ({ workers = numCPUs, threads = numCPUs, retries = 0 }) {
        this._workersNumber = workers;
        this._threadsNumber = threads;
        this._retries = retries;
        return this;
    }

    async run () {
        if (this._workersNumber && cluster.isMaster) {

            for (let i = 0; i < this._workersNumber; i++) {

                const worker = cluster.fork();
                worker.weight = 0;

                (worker => {
                    worker.on("message", o => {
                        worker.weight -= o.weight;

                        if (o.error !== undefined) {
                            this.emit("error", o);
                        }

                        if (o.result !== undefined) {
                            this.emit("success", o);
                        }
                    });
                })(worker);
            }

            let next = await this._iterator.next();

            while (!next.done) {
                const args = next.value;
                args.weight = args.weight || 1;

                const worker = this._lessLoadedWorker();
                worker.send(args);
                worker.weight += args.weight;

                next = await this._iterator.next();
            }

        } else {

            this._pool = new InternalPool({
                threads: this._threadsNumber,
                retries: this._retries,
            });

            if (cluster.isWorker) {

                this._pool.on("error", o => {
                    process.send(o);
                });

                this._pool.on("success", o => {
                    process.send(o);
                });

                process.on("message", ({ args, weight = 1, retries }) => {
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
                    const { args, weight = 1, retries } = next.value;

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
                        for (worker of Object.values(cluster.workers)) {
                            worker.kill();
                        }
                        clearInterval(timerId);
                        resolve();
                        return;
                    }

                    if (timeout != null && (new Date() - start > timeout)) {
                        clearTimeout(timerId);

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
}

module.exports = {
    Pool,
}
