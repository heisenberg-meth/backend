// src/bootstrap.js

// Catch missing module errors synchronously before anything else
process.on('uncaughtException', (err) => {
  if (err.code === 'ERR_MODULE_NOT_FOUND') {
    const match =
      err.message.match(/Cannot find (?:package|module) '([^']+)' imported from (.+)/) ||
      err.message.match(/Cannot find module '([^']+)'/);
    const moduleName = match ? match[1] : err.message;
    const importedFrom = match && match[2] ? match[2] : 'unknown';

    console.error(
      JSON.stringify(
        {
          event: 'STARTUP_DEPENDENCY_ERROR',
          Module: moduleName,
          ImportedFrom: importedFrom,
          Resolution: 'Missing File',
          rawError: err.message,
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }
});

// Dynamically import the main server
import('./fastify-server.js').catch((err) => {
  if (err.code === 'ERR_MODULE_NOT_FOUND') {
    const match =
      err.message.match(/Cannot find (?:package|module) '([^']+)' imported from (.+)/) ||
      err.message.match(/Cannot find module '([^']+)'/);
    const moduleName = match ? match[1] : err.message;
    const importedFrom = match && match[2] ? match[2] : 'unknown';

    console.error(
      JSON.stringify(
        {
          event: 'STARTUP_DEPENDENCY_ERROR',
          Module: moduleName,
          ImportedFrom: importedFrom,
          Resolution: 'Missing File',
          rawError: err.message,
        },
        null,
        2,
      ),
    );
  } else {
    console.error(
      JSON.stringify(
        {
          event: 'BOOTSTRAP_ERROR',
          message: err.message,
          stack: err.stack,
        },
        null,
        2,
      ),
    );
  }
  process.exit(1);
});
