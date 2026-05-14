const { Pool } = require('pg');

// Configurações extraídas do Server2.js
const pool = new Pool({
  user: "postgres",
  host: "localhost",
  database: "postgres",
  password: "123",
  port: 5432,
});

async function testConnection() {
  console.log('--- Iniciando Teste de Conexão com o Banco de Dados ---');
  console.log(`Tentando conectar a: postgres://postgres:***@localhost:5432/postgres`);
  
  const client = await pool.connect();
  try {
    console.log('✅ Conexão estabelecida com sucesso!');
    
    // Teste 1: Versão do Banco
    const resVersion = await client.query('SELECT version()');
    console.log('📊 Versão do PostgreSQL:', resVersion.rows[0].version);

    // Teste 2: Verificar tabelas existentes
    const resTables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    
    console.log('📂 Tabelas encontradas no esquema public:');
    if (resTables.rows.length > 0) {
      resTables.rows.forEach(row => console.log(`   - ${row.table_name}`));
    } else {
      console.log('   (Nenhuma tabela encontrada)');
    }

    // Teste 3: Verificar estrutura da tabela users (se existir)
    if (resTables.rows.some(r => r.table_name === 'users')) {
      const resUsers = await client.query('SELECT COUNT(*) FROM users');
      console.log(`👥 Total de usuários cadastrados: ${resUsers.rows[0].count}`);
    }

  } catch (err) {
    console.error('❌ Erro durante o teste:', err.message);
    if (err.code === 'ECONNREFUSED') {
      console.error('💡 Dica: O serviço PostgreSQL parece não estar rodando no host/porta especificado.');
    } else if (err.code === '28P01') {
      console.error('💡 Dica: Senha incorreta para o usuário postgres.');
    }
  } finally {
    client.release();
    await pool.end();
    console.log('--- Teste Finalizado ---');
  }
}

testConnection();
