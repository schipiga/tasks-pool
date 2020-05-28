"use strict";

class Task {

    constructor (task, args, weight = 1, retries = 0) {
        this.task = task;
        this.args = args;
        this.weight = weight;
        this.retries = retries;
        this.retried = 0;
    }
}

module.exports = {
    Task,
}
