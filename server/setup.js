// Interactive (and non-interactive) credential setup.
//   node server/setup.js                     -> prompts for username/password
//   CLAUDE_WEB_USER=me CLAUDE_WEB_PASSWORD=secret node server/setup.js  -> non-interactive
import readline from 'node:readline';
import { setCredentials, isConfigured, DATA_DIR, DEFAULT_PORT } from './config.js';

function ask(question, { hidden = false } = {}) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    if (hidden) {
      const stdout = process.stdout;
      const onData = (char) => {
        char = char.toString();
        if (char === '\n' || char === '\r' || char === '') {
          process.stdin.removeListener('data', onData);
        } else {
          // overwrite typed char with a star
          readline.clearLine(stdout, 0);
          readline.cursorTo(stdout, 0);
          stdout.write(question + '*'.repeat(rl.line.length));
        }
      };
      process.stdin.on('data', onData);
    }
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) stdout_newline();
      resolve(answer.trim());
    });
  });
}

function stdout_newline() {
  process.stdout.write('\n');
}

async function main() {
  const envUser = process.env.CLAUDE_WEB_USER;
  const envPass = process.env.CLAUDE_WEB_PASSWORD;
  const envPort = process.env.CLAUDE_WEB_PORT;

  let username, password, port;
  if (envPass) {
    username = envUser || 'admin';
    password = envPass;
    port = envPort;
  } else {
    console.log('\n  Claude Web — account setup');
    console.log('  Config will be stored in: ' + DATA_DIR + '\n');
    if (isConfigured()) console.log('  (an account already exists; this will overwrite it)\n');
    username = (await ask('  Username [admin]: ')) || 'admin';
    password = await ask('  Password: ', { hidden: true });
    if (!password || password.length < 4) {
      console.error('\n  Password must be at least 4 characters.\n');
      process.exit(1);
    }
    const confirm = await ask('  Confirm password: ', { hidden: true });
    if (password !== confirm) {
      console.error('\n  Passwords do not match.\n');
      process.exit(1);
    }
    port = (await ask(`  Port [${DEFAULT_PORT}]: `)) || String(DEFAULT_PORT);
  }

  setCredentials(username, password, port);
  console.log(`\n  ✓ Account "${username}" saved. Start the server with:  npm start\n`);
  process.exit(0);
}

main();
