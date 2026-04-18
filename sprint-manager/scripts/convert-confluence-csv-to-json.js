const fs = require('node:fs');
const path = require('node:path');
const { mapHeaders, parseCsv } = require('./import-confluence-csv');

function toRowObject(headers, row) {
  return headers.reduce((result, header, index) => {
    if (!header) {
      return result;
    }

    result[header] = String(row[index] || '').trim();
    return result;
  }, {});
}

function splitDelimitedValues(value) {
  return String(value || '')
    .split(/\s*\|\|\s*/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildTask(rowData) {
  const title = String(rowData.title || '').trim();

  if (!title) {
    return null;
  }

  const comments = splitDelimitedValues(rowData.comments);
  const links = splitDelimitedValues(rowData.bugUrl);
  const task = {
    title,
    status: rowData.status || '',
    assignee: rowData.assignee || '',
    area: rowData.squad || '',
    priority: rowData.priority || '',
  };

  if (rowData.effort) {
    task.effort = rowData.effort;
  }

  if (rowData.start) {
    task.start = rowData.start;
  }

  if (rowData.end) {
    task.end = rowData.end;
  }

  if (rowData.release) {
    task.release = rowData.release;
  }

  if (rowData.milestone) {
    task.milestone = rowData.milestone;
  }

  if (rowData.blocked) {
    task.blocked = rowData.blocked;
  }

  if (links.length) {
    task.jiraUrl = links[0];
  }

  if (links.length > 1) {
    task.relatedLinks = links.slice(1);
  }

  if (comments.length) {
    task.commentsOrder = 'newest-first';
    task.comments = comments;
  }

  return task;
}

function parseArguments(argv) {
  const [, , inputPath, outputPath] = argv;

  if (!inputPath) {
    throw new Error(
      'Usage: node scripts/convert-confluence-csv-to-json.js <input-csv> [output-json]'
    );
  }

  const resolvedInputPath = path.resolve(process.cwd(), inputPath);
  const defaultOutputPath = path.join(
    process.cwd(),
    'imports',
    `${path.basename(inputPath, path.extname(inputPath))}.json`
  );

  return {
    inputPath: resolvedInputPath,
    outputPath: path.resolve(process.cwd(), outputPath || defaultOutputPath),
  };
}

function convertCsvToJson(inputPath, outputPath) {
  const content = fs.readFileSync(inputPath, 'utf8');
  const rows = parseCsv(content);

  if (rows.length < 2) {
    throw new Error('CSV must include a header row and at least one task row.');
  }

  const [headerRow, ...dataRows] = rows;
  const headers = mapHeaders(headerRow);
  const tasks = dataRows
    .map((row) => buildTask(toRowObject(headers, row)))
    .filter(Boolean);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify({ tasks }, null, 2)}\n`, 'utf8');

  return {
    taskCount: tasks.length,
    outputPath,
  };
}

function main() {
  const { inputPath, outputPath } = parseArguments(process.argv);
  const result = convertCsvToJson(inputPath, outputPath);

  console.log(`Converted ${result.taskCount} tasks to ${result.outputPath}`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message || 'Unable to convert Confluence CSV to JSON.');
    process.exitCode = 1;
  }
}

module.exports = {
  buildTask,
  convertCsvToJson,
};
