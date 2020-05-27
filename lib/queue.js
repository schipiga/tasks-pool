const EventEmitter = require("events");

const { Task } = require("./task");

class Queue extends EventEmitter {

    constructor (maxRetries) {
        super();
        this.maxRetries = maxRetries;
        this.weight = 0;
        this.isClosed = false;
        this.isRun = false;
        this._tasks = [];
    }

    add (task, args, weight = 1, retries) {
        if (this.isClosed) {
            throw Error("Can't add task, queue is closed");
        }

        const maxRetries = retries != undefined ? retries : this.maxRetries;
        const t = new Task(task, args, weight, maxRetries);
        this._tasks.push(t);
        this.weight += weight;

        if (!this.isRun) {
            this.run(); /* NOTE: don't wait for finish of course it should happen async. */
        }
    }

    async run () {
        this.isRun = true;

        while (this._tasks.length) {
            const t = this._tasks.shift();

            try {
                const result = await t.task.apply(null, t.args);

                if (this.isClosed) {
                    break;
                }

                this.emit("success", {
                    args: t.args,
                    result: result,
                    weight: t.weight,
                });
                this.weight -= t.weight;

            } catch (e) {
                if (this.isClosed) {
                    break;
                }

                if (t.retries === t.maxRetries) {
                    this.emit("error", {
                        args: t.args,
                        error: e.stack,
                        weight: t.weight,
                    });
                    this.weight -= t.weight;

                } else {
                    t.retries++;
                    this._tasks.push(t);
                }
            }
        }
        this.isRun = false;
    }

    close () {
        this._tasks = [];
        this.weight = 0;
        this.isClosed = true;
    }
}

module.exports = {
    Queue,
}
