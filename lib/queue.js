"use strict";

const EventEmitter = require("events");

const { Task } = require("./task");

class Queue extends EventEmitter {

    constructor () {
        super();
        this.weight = 0;
        this.isClosed = false;
        this.isRun = false;
        this._tasks = [];
    }

    add (taskHandler, taskArgs, taskWeight = 1, taskRetries) {
        if (this.isClosed) {
            throw Error("Can't add task, queue is closed");
        }

        const t = new Task(taskHandler, taskArgs, taskWeight, taskRetries);
        this.weight += taskWeight;
        this._tasks.push(t);

        if (!this.isRun) {
            this.run(); // don't wait for finish of course it should happen async
        }
    }

    async run () {
        this.isRun = true;

        while (this._tasks.length) {
            const task = this._tasks.shift();

            try {
                const result = await task.func.apply(null, task.args);

                if (this.isClosed) {
                    break;
                }

                this.emit("success", {
                    args: task.args,
                    result: result,
                    weight: task.weight,
                    retries: task.retries,
                    retried: task.retried,
                });
                this.weight -= task.weight;

            } catch (err) {
                if (this.isClosed) {
                    break;
                }

                if (task.retried === task.retries) {
                    this.emit("error", {
                        args: task.args,
                        error: err.stack,
                        weight: task.weight,
                        retries: task.retries,
                        retried: task.retried,
                    });
                    this.weight -= task.weight;

                } else {
                    task.retried++;
                    this._tasks.push(task);
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
