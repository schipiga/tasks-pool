const EventEmitter = require("events");

const { Queue } = require("./queue");

class Pool extends EventEmitter {

    constructor ({ threads, retries }) {
        super();
        this._qq = [];

        for (let i = 0; i < threads; i++) {
            const q = new Queue(retries);

            q.on("error", o => {
                this.emit("error", o);
            });

            q.on("success", o => {
                this.emit("success", o);
            });

            this._qq.push(q);
        }
    }

    add (task, args, weight = 1) {
        let queue = this._qq[0];

        if (queue.weight > 0 && this._qq.length > 1) {
            for (const q of this._qq) {
                if (q.weight < queue.weight) {
                    queue = q;
                }
            }
        }
        queue.add(task, args, weight);
    }

    async wait (timeout = null, pollingTime = 100) {
        const start = new Date();

        await new Promise((resolve, reject) => {
            const timerId = setInterval(() => {

                let q, isFinished = true;
                for (q of this._qq) {
                    if (q.weight > 0) {
                        isFinished = false;
                        break;
                    }
                }

                if (isFinished) {
                    clearInterval(timerId);

                    for (q of this._qq) {
                        q.close();
                    }

                    resolve();
                    return;
                }

                if (timeout != null && (new Date() - start > timeout)) {
                    clearInterval(timerId);

                    for (q of this._qq) {
                        q.close();
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
