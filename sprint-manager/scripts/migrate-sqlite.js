const { DatabaseSync } = require('node:sqlite');
const { databasePath, listResources, listTasks } = require('../server/taskStore');

const database = new DatabaseSync(databasePath, { readonly: true });
const resourceColumns = database.prepare('PRAGMA table_info(resources)').all();
const taskColumns = database.prepare('PRAGMA table_info(tasks)').all();

console.log(
  JSON.stringify(
    {
      databasePath,
      resources: {
        count: listResources().length,
        columns: resourceColumns.map((column) => column.name),
      },
      tasks: {
        count: listTasks().length,
        columns: taskColumns.map((column) => column.name),
      },
    },
    null,
    2
  )
);
