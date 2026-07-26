const { createClient } = require('@supabase/supabase-js');

/**
 * Backend de armazenamento no Supabase, usado em produção serverless
 * (Vercel/Netlify), onde o disco é somente leitura e efêmero.
 *
 * Tabelas esperadas (SQL de criação no README):
 *   documents(key text pk, value jsonb, updated_at timestamptz)
 *   rsvps(id text pk, data jsonb, created_at timestamptz)
 *   messages(id text pk, data jsonb, created_at timestamptz)
 */

function isConfigured() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function createSupabaseClient() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

function fail(action, error) {
  throw new Error(`Supabase: falha ao ${action} (${error.message})`);
}

/** Documento único (configuração do site) guardado como jsonb. */
function createDocStore(client, key, seed) {
  async function write(value) {
    const { error } = await client
      .from('documents')
      .upsert({ key, value, updated_at: new Date().toISOString() });
    if (error) fail(`salvar "${key}"`, error);
  }

  async function read() {
    const { data, error } = await client
      .from('documents')
      .select('value')
      .eq('key', key)
      .maybeSingle();
    if (error) fail(`ler "${key}"`, error);
    if (data) return data.value;
    const initial = seed();
    await write(initial);
    return initial;
  }

  return { read, write };
}

/** Lista de itens `{ id, ... }` — cada item vira uma linha da tabela. */
function createListStore(client, table) {
  return {
    async all() {
      const { data, error } = await client
        .from(table)
        .select('data')
        .order('created_at', { ascending: true });
      if (error) fail(`listar ${table}`, error);
      return data.map((row) => row.data);
    },
    async add(item) {
      const { error } = await client.from(table).insert({ id: item.id, data: item });
      if (error) fail(`gravar em ${table}`, error);
    },
    async remove(id) {
      const { error } = await client.from(table).delete().eq('id', id);
      if (error) fail(`excluir de ${table}`, error);
    },
    async clear() {
      const { error } = await client.from(table).delete().neq('id', '');
      if (error) fail(`limpar ${table}`, error);
    },
  };
}

module.exports = { isConfigured, createSupabaseClient, createDocStore, createListStore };
