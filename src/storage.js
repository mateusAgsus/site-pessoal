const fs = require('fs');

/**
 * Armazenamento em arquivo JSON com escrita atômica (grava em .tmp e
 * renomeia) para evitar corrupção se o processo cair no meio da escrita.
 * `seed` é chamado uma única vez, quando o arquivo ainda não existe.
 *
 * A interface é assíncrona (read/write retornam Promise) para ser
 * intercambiável com o backend Supabase usado em produção.
 */
function createStore(file, seed) {
  function readSync() {
    try {
      // BOM pode aparecer em arquivos editados no Windows — remove antes do parse
      return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
      const initial = seed();
      writeSync(initial);
      return initial;
    }
  }

  function writeSync(data) {
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmp, file);
  }

  return {
    read: async () => readSync(),
    write: async (data) => writeSync(data),
    file,
  };
}

/**
 * Lista de itens `{ id, ... }` sobre um arquivo JSON — usada para
 * confirmações de presença e recados. Mesma interface do listStore
 * do Supabase (all/add/remove).
 */
function createListStore(file) {
  const doc = createStore(file, () => []);
  return {
    all: () => doc.read(),
    async add(item) {
      const list = await doc.read();
      list.push(item);
      await doc.write(list);
    },
    async remove(id) {
      const list = await doc.read();
      await doc.write(list.filter((item) => item.id !== id));
    },
    clear: () => doc.write([]),
  };
}

module.exports = { createStore, createListStore };
