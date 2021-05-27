`tasks-pool` - tiny but light-weight and high-performed library to launch tasks asynchroniously in multiple processes and threads.

Quick Start
===========

install:

```
npm i tasks-pool
```

use:

```js
const { Pool } = require("tasks-pool");

const generator = function* () {
    const items = [{ args: [1] }, { args: [2] }, { args: [3] }]; // list of arguments for handler
    for (const item of items) {
        yield item;
    }
}

const handler = val => {
    if (val === 3) throw Error(`Bad value ${val}!`)
    return new Promise(resolve => {
        setTimeout(() => resolve(val), 2000);
    });
}

const main = async () => {
    const pool = new Pool(handler, generator);
    pool.on('success', console.log);
    pool.on('error', console.log);
    await pool.run(); // wait for tasks scheduling
    await pool.wait(); // wait for tasks finishing
}

main();
```

Options
=======

- Generator can be `async` also:

```js
const generator = async function* () {
    const items = [{ args: [1] }, { args: [2] }, { args: [3] }];
    for (const item of items) {
        yield await item;
    }
}
```

- Tasks can have different weight (default is `1`), which used for balancing:

```js
const generator = async function* () {
    const items = [{ args: [1], weight: 1 }, { args: [2], weight: 2 }, { args: [3], weight: 3 }];
    for (const item of items) {
        yield await item;
    }
}
```

- Tasks can have different retries. If not defined then pool `retries` is used:

```js
const generator = async function* () {
    const items = [{ args: [1], retries: 1 }, { args: [2], retries: 2 }, { args: [3], retries: 3 }];
    for (const item of items) {
        yield await item;
    }
}
```

- `Pool` can receive generator object as well as generator function:

```js
new Pool(handler, generator)
new Pool(handler, generator())
```

- `Pool` can receive even sequence as second argument:

```js
new Pool(handler, [{ args: [1] }, { args: [2] }, { args: [3] }])
```

- `Pool` second argument (if it's not like in above example) should follow iterator protocol - https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Iterators_and_Generators

- `Pool` has third argument - named options: `{ workers, threads, retries, ha }`:

    - `workers` - number of worker processes. By default is cpus number. If `0` no workers are forked and tasks are executed in master process.
    - `threads` - number of threads on worker (threads are organised via JavaScript async/await, native Node.js threads aren't used). By default is cpus number. Should be `1` minimum.
    - `retries` - number of retries for task if it's failed. By default is `0`. Can be overwritten by task `retries`.
    - `ha` - Pass `true` if want to provide high-availability and to restart worker if it's finished suddenly. By default is `false`.

- `Pool` raises events on task `success` or `error`.

```js
pool.on('success', task => {
    console.log('task arguments', task.args);
    console.log('task result', task.result);
    console.log('task weight', task.weight);
    console.log('task max retries', task.retries);
    console.log('task was retried', task.retried);
});
pool.on('error', task => {
    console.log('task arguments', task.args);
    console.log('task error stack trace', task.error);
    console.log('task weight', task.weight);
    console.log('task max retries', task.retries);
    console.log('task was retried', task.retried);
});
```

- `Pool` can be used as builder pattern:

```js
new Pool()
    .handler((a, b) => {
        console.log(a, b);
    })
    .iterator(function* () {
        const iter = [{ args: [1, 3] }, { args: [2, 4] }];
        for (const it of iter) {
            yield it;
        }
    })
    .options({ workers: 2, threads: 2, retries: 2 })
    .run();
```