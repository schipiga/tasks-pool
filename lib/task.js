class Task {

    constructor (task, args, weight = 1) {
        this.task = task;
        this.args = args;
        this.weight = weight;
        this.retries = 0;
    }
}

module.exports = {
    Task,
}
