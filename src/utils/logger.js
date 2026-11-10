const chalk = require('chalk');

function createLogger() {
  const log = (level, message, details) => {
    const prefix = `[${new Date().toISOString()}] [${level}]`;
    if (details) {
      console.log(`${prefix} ${message}`);
      console.log(details);
      return;
    }

    switch (level) {
      case 'INFO':
        console.log(chalk.cyan(`${prefix} ${message}`));
        break;
      case 'WARN':
        console.warn(chalk.yellow(`${prefix} ${message}`));
        break;
      case 'ERROR':
        console.error(chalk.red(`${prefix} ${message}`));
        break;
      case 'DEBUG':
        console.log(chalk.gray(`${prefix} ${message}`));
        break;
      default:
        console.log(`${prefix} ${message}`);
    }
  };

  return {
    info: (message, details) => log('INFO', message, details),
    warn: (message, details) => log('WARN', message, details),
    error: (message, details) => log('ERROR', message, details),
    debug: (message, details) => log('DEBUG', message, details),
  };
}

module.exports = { createLogger };
