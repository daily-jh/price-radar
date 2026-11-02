process.env.LOCAL_DEMO='true';
process.env.HOST='127.0.0.1';
process.env.PORT=process.env.PORT||'3080';
process.env.APP_ORIGIN=`http://127.0.0.1:${process.env.PORT}`;
process.env.DATABASE_PATH=':memory:';
await import('./server.mjs');
