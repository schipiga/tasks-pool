"use strict";

const EventEmitter = require("events");

const { Queue } = require("./queue");

class Pool extends EventEmitter {

    constructor (threads) {
        super();
        this._queues = [];

        for (let i = 0; i < threads; i++) {
            const queue = new Queue();

            queue.on("error", task => {
                this.emit("error", task);
            });

            queue.on("success", task => {
                this.emit("success", task);
            });

            this._queues.push(queue);
        }
    }

    add (taskHandler, taskArgs, taskWeight = 1, taskRetries) {
        let lessLoadedQueue = this._queues[0];

        if (lessLoadedQueue.weight > 0 && this._queues.length > 1) {
            for (const queue of this._queues) {
                if (queue.weight < lessLoadedQueue.weight) {
                    lessLoadedQueue = queue;
                }
            }
        }
        lessLoadedQueue.add(taskHandler, taskArgs, taskWeight, taskRetries);
    }

    async wait (timeout = null, pollingTime = 100) {
        const start = new Date();

        await new Promise((resolve, reject) => {
            const timerId = setInterval(() => {

                let queue, isFinished = true;
                for (queue of this._queues) {
                    if (queue.weight > 0) {
                        isFinished = false;
                        break;
                    }
                }

                if (isFinished) {
                    clearInterval(timerId);

                    for (queue of this._queues) {
                        queue.close();
                    }

                    resolve();
                    return;
                }

                if (timeout != null && (new Date() - start > timeout)) {
                    clearInterval(timerId);

                    for (queue of this._queues) {
                        queue.close();
                    }

                    reject(Error(`Timeout ${timeout} ms has expired`));
                    return;
                }
            }, pollingTime);
        });
    }
}

module.exports = {
    Pool,
}
