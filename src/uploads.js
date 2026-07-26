const fs = require('fs');
const path = require('path');

/**
 * Destino das imagens (uploads do painel e fotos baixadas de links).
 * Duas implementações com a mesma interface:
 *   save(name, buffer, contentType) → Promise<url pública>
 */

function createLocalUploads(dir) {
  return {
    async save(name, buffer) {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, name), buffer);
      return '/uploads/' + name;
    },
  };
}

function createSupabaseUploads(client, bucket) {
  return {
    async save(name, buffer, contentType) {
      const { error } = await client.storage.from(bucket).upload(name, buffer, { contentType });
      if (error) {
        throw new Error(`Supabase: falha ao salvar imagem no bucket "${bucket}" (${error.message})`);
      }
      return client.storage.from(bucket).getPublicUrl(name).data.publicUrl;
    },
  };
}

module.exports = { createLocalUploads, createSupabaseUploads };
