`tasks-pool` - tiny but light-weight and high-performed library to launch tasks asynchroniously in multiple processes and threads.

Quick Start
===========

```js
const cluster = require('cluster');

const { Pool } = require("tasks-pool");

const generator = function* () {
    const g = [{ a: 1 }, { a: 2 }, { a: 3 }] // sequence of named arguments for handler
    for (let i of g) {
        yield i;
    }
}

const handler = async ({ a }) => { // use named arguments always
    if (a === 3) throw Error(`Bad value ${a}!`)
    return new Promise(resolve => {
        setTimeout(() => resolve(a), 2000);
    });
}

const main = async () => {
    const pool = new Pool(handler, generator);
    pool.on('success', console.log);
    pool.on('error', console.log);
    await pool.run(); // wait for tasks scheduling
    if (cluster.isWorker) return; // don't call next code after fork in worker
    await pool.wait(); // wait for tasks finishing
}

main();
```

Options
=======

- Generator can be `async` also:

```js
const generator = async function* () {
    const g = [{ a: 1 }, { a: 2 }, { a: 3 }]
    for (let i of g) {
        yield await i;
    }
}
```

- Tasks can have different weight (default is `1`), which used for balancing:

```js
const generator = async function* () {
    const g = [{ taskWeight: 1, a: 1 }, { taskWeight: 2, a: 2 }, { taskWeight:3, a: 3 }]
    for (let i of g) {
        yield await i;
    }
}
```

- Don't use `taskWeight` as named argument in handler. It's reserved word and isn't sending to handler.

- `Pool` can receive generator object as well as generator function:

```js
new Pool(handler, generator)
new Pool(handler, generator())
```

- `Pool` can receive even sequence as second argument:

```js
new Pool(handler, [{ a: 1 }, { a: 2 }])
```

- `Pool` second argument should follow iterator protocol - https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Iterators_and_Generators

- `Pool` has third argument - named options: `{ workers, threads, retries }`:

    - `workers` - number of worker processes. By default is cpus number. If `0` no workers are folked and tasks are executed in master process.
    - `threads` - number of threads on worker (threads are organised via JavaScript async/await, native Node.js threads aren't used). By default is cpus number. Should `1` mininum.
    - `retries` - number of retries for task if it's failed. By default is `0`.

- `Pool` raises events on task `success` or `error`.

```js
pool.on('success', o => {
    console.log('task arguments', o.args);
    console.log('task result', o.result);
    console.log('task weight', o.taskWeight);
});
pool.on('error', o => {
    console.log('task arguments', o.args);
    console.log('task error stack trace', o.error);
    console.log('task weight', o.taskWeight);
});
```