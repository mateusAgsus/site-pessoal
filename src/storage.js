const fs = require('fs');

/**
 * Armazenamento em arquivo JSON com escrita atômica (grava em .tmp e
 * renomeia) para evitar corrupção se o processo cair no meio da escrita.
 * `seed` é chamado uma única vez, quando o arquivo ainda não existe.
 */
function createStore(file, seed) {
  function read() {
    try {
      // BOM pode aparecer em arquivos editados no Windows — remove antes do parse
      return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
      const initial = seed();
      write(initial);
      return initial;
    }
  }

  function write(data) {
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmp, file);
  }

  return { read, write, file };
}

module.exports = { createStore };
