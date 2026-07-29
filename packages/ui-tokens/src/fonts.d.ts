// Permite importar arquivos de fonte como assets (resolvidos pelo Metro/Expo).
// O tsc trata qualquer import `*.ttf`/`*.woff2` como este módulo, sem resolver
// o arquivo em disco. Em runtime, o Metro bundler entrega o asset real.
declare module '*.ttf';
declare module '*.woff2';

// `require()` de asset é resolvido pelo Metro em runtime; aqui só o tipo.
declare function require(path: string): number;
