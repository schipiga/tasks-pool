class Task {

    constructor (task, args, weight = 1, maxRetries = 0) {
        this.task = task;
        this.args = args;
        this.weight = weight;
        this.maxRetries = maxRetries;
        this.retries = 0;
    }
}

module.exports = {
    Task,
}
