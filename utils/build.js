const fs = require('fs'),
  ncp = require('ncp').ncp,
  path = require('path'),
  rimraf = require('rimraf'),
  spawn = require('cross-spawn'),
  chalk = require('chalk');

const TMP_FOLDER = path.join(__dirname, '..', '.tmp');
ncp.limit = 20;

module.exports = function build(dependency) {
  const ignoredFiles = dependency.ignore.map((i) => path.join(dependency.destination, i)),
    toUnpackFiles = Object.keys(dependency.unpack).map((key) => dependency[key] = path.join(dependency.destination, key)),
    existingFiles = [path.join(TMP_FOLDER, dependency.name)];
  unpackFiles(toUnpackFiles);

  if (!!dependency) {
    return chain(
      cleanFiles(existingFiles),
      cloneRepo,
      moveFiles(path.join(TMP_FOLDER, dependency.name)),
      cleanFiles(ignoredFiles)
    )(dependency);
  } else {
    return handleError('No dependency found');
  }
};

/*
 * This method is a promise wrapper to chain promises
 * it takes in the promises it has to process and returns
 * a function that takes in the dependency that should be
 * passed along the chain.
 */
function chain(...promises) {
  if (promises.length === 0) {
    return () => {
    };
  }
  const currentPromise = promises.shift();
  return (dependency) => {
    return currentPromise(dependency)
      .then(() => chain(...promises)(dependency))
      .catch(handleError);
  }
}

/*
 * This method spawns a child process that executes
 * the cloning of the dependency repository
 */
function cloneRepo(dependency) {
  const {name, repository, branch} = dependency;
  return new Promise((resolve, reject) => {
    const child = spawn('git', ['clone', '-b', branch, repository, `${TMP_FOLDER}/${name}`], {stdio: 'inherit'});

    child.on('error', (err) => {
      reject(err);
    });

    child.on('close', () => {
      resolve(dependency);
    })
  });
}

/*
 * This method spawns a child process that executes
 * the moving of the dependency files
 */
function moveFiles(path) {
  return (dependency) => {
    const {name, destination} = dependency;
    console.log('Copying files for dependency ' + name);
    return new Promise((resolve, reject) => {
      ncp(path, destination, {clobber: true}, function (err) {
        if (err) {
          return reject(err);
        }
        return resolve(dependency);
      });
    });
  }
}

function unpackFiles(files) {
  console.log(files);
}

function cleanFiles(files) {
  return (dependency) => {
    const {name} = dependency;

    console.log(chalk.green('Cleaning up ' + name));

    return Promise.all(files.map(cleanFile));

    function cleanFile(file) {
      return new Promise((resolve, reject) => {
        return fs.exists(file, (exists) => {
          if (!exists) {
            resolve(dependency);
          } else {
            rimraf(file, (err) => {
              if (err) {
                reject(err);
              }
              resolve(dependency);
            });
          }
        });
      });
    }
  }
}

function handleError(err) {
  console.log(chalk.red(err));
}