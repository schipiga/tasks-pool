"use strict";

class Task {

    constructor (func, args, weight = 1, retries = 0) {
        this.func = func;
        this.args = args;
        this.weight = weight;
        this.retries = retries; // how many times task can be retried
        this.retried = 0; // how many times task was retried
    }
}

module.exports = {
    Task,
}
