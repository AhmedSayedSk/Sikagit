import type { IconType } from 'react-icons';
import {
  SiPython, SiJavascript, SiTypescript, SiHtml5, SiCss, SiPhp,
  SiRuby, SiRust, SiGo, SiSwift, SiKotlin, SiDart, SiLua,
  SiCplusplus, SiC, SiDotnet, SiPerl, SiR, SiScala, SiElixir,
  SiHaskell, SiClojure, SiErlang, SiJulia, SiGnubash,
  SiDocker, SiMarkdown, SiYaml, SiToml, SiGraphql,
  SiSvelte, SiVuedotjs, SiReact, SiAngular,
  SiSass, SiLess, SiTailwindcss,
  SiJson, SiGit, SiNpm,
} from 'react-icons/si';
import {
  DiJava, DiDatabase,
} from 'react-icons/di';
import {
  VscFile, VscFileMedia, VscFilePdf, VscFileZip, VscTerminalBash,
} from 'react-icons/vsc';

interface FileIconEntry {
  Icon: IconType;
  color: string;
  label: string;
}

const EXT_MAP: Record<string, FileIconEntry> = {
  // JavaScript / TypeScript
  js:    { Icon: SiJavascript,  color: '#f7df1e', label: 'JavaScript' },
  mjs:   { Icon: SiJavascript,  color: '#f7df1e', label: 'JavaScript' },
  cjs:   { Icon: SiJavascript,  color: '#f7df1e', label: 'JavaScript' },
  jsx:   { Icon: SiReact,       color: '#61dafb', label: 'React JSX' },
  ts:    { Icon: SiTypescript,   color: '#3178c6', label: 'TypeScript' },
  mts:   { Icon: SiTypescript,   color: '#3178c6', label: 'TypeScript' },
  cts:   { Icon: SiTypescript,   color: '#3178c6', label: 'TypeScript' },
  tsx:   { Icon: SiReact,       color: '#61dafb', label: 'React TSX' },

  // Web
  html:  { Icon: SiHtml5,       color: '#e34f26', label: 'HTML' },
  htm:   { Icon: SiHtml5,       color: '#e34f26', label: 'HTML' },
  css:   { Icon: SiCss,        color: '#1572b6', label: 'CSS' },
  scss:  { Icon: SiSass,        color: '#cc6699', label: 'SCSS' },
  sass:  { Icon: SiSass,        color: '#cc6699', label: 'Sass' },
  less:  { Icon: SiLess,        color: '#1d365d', label: 'Less' },
  vue:   { Icon: SiVuedotjs,    color: '#4fc08d', label: 'Vue' },
  svelte:{ Icon: SiSvelte,      color: '#ff3e00', label: 'Svelte' },
  angular:{ Icon: SiAngular,    color: '#dd0031', label: 'Angular' },

  // Python
  py:    { Icon: SiPython,      color: '#3776ab', label: 'Python' },
  pyw:   { Icon: SiPython,      color: '#3776ab', label: 'Python' },
  pyx:   { Icon: SiPython,      color: '#3776ab', label: 'Python' },
  ipynb: { Icon: SiPython,      color: '#f37626', label: 'Jupyter' },

  // PHP
  php:   { Icon: SiPhp,         color: '#777bb4', label: 'PHP' },

  // Ruby
  rb:    { Icon: SiRuby,        color: '#cc342d', label: 'Ruby' },
  erb:   { Icon: SiRuby,        color: '#cc342d', label: 'Ruby ERB' },
  gemspec:{ Icon: SiRuby,       color: '#cc342d', label: 'Gemspec' },

  // Rust
  rs:    { Icon: SiRust,        color: '#dea584', label: 'Rust' },

  // Go
  go:    { Icon: SiGo,          color: '#00add8', label: 'Go' },

  // Java / Kotlin
  java:  { Icon: DiJava,        color: '#ed8b00', label: 'Java' },
  jar:   { Icon: DiJava,        color: '#ed8b00', label: 'Java Archive' },
  kt:    { Icon: SiKotlin,      color: '#7f52ff', label: 'Kotlin' },
  kts:   { Icon: SiKotlin,      color: '#7f52ff', label: 'Kotlin' },

  // C / C++ / C#
  c:     { Icon: SiC,           color: '#a8b9cc', label: 'C' },
  h:     { Icon: SiC,           color: '#a8b9cc', label: 'C Header' },
  cpp:   { Icon: SiCplusplus,   color: '#00599c', label: 'C++' },
  cxx:   { Icon: SiCplusplus,   color: '#00599c', label: 'C++' },
  cc:    { Icon: SiCplusplus,   color: '#00599c', label: 'C++' },
  hpp:   { Icon: SiCplusplus,   color: '#00599c', label: 'C++ Header' },
  cs:    { Icon: SiDotnet,      color: '#239120', label: 'C#' },

  // Swift / Dart
  swift: { Icon: SiSwift,       color: '#f05138', label: 'Swift' },
  dart:  { Icon: SiDart,        color: '#0175c2', label: 'Dart' },

  // Functional / Other
  scala: { Icon: SiScala,       color: '#dc322f', label: 'Scala' },
  ex:    { Icon: SiElixir,      color: '#4b275f', label: 'Elixir' },
  exs:   { Icon: SiElixir,      color: '#4b275f', label: 'Elixir' },
  hs:    { Icon: SiHaskell,     color: '#5e5086', label: 'Haskell' },
  clj:   { Icon: SiClojure,     color: '#5881d8', label: 'Clojure' },
  erl:   { Icon: SiErlang,      color: '#a90533', label: 'Erlang' },
  jl:    { Icon: SiJulia,       color: '#9558b2', label: 'Julia' },
  r:     { Icon: SiR,           color: '#276dc3', label: 'R' },
  pl:    { Icon: SiPerl,        color: '#39457e', label: 'Perl' },
  lua:   { Icon: SiLua,         color: '#2c2d72', label: 'Lua' },

  // Shell
  sh:    { Icon: SiGnubash,     color: '#4eaa25', label: 'Shell' },
  bash:  { Icon: SiGnubash,     color: '#4eaa25', label: 'Bash' },
  zsh:   { Icon: SiGnubash,     color: '#4eaa25', label: 'Zsh' },
  fish:  { Icon: VscTerminalBash, color: '#4eaa25', label: 'Fish' },
  ps1:   { Icon: VscTerminalBash, color: '#012456', label: 'PowerShell' },
  bat:   { Icon: VscTerminalBash, color: '#c1f12e', label: 'Batch' },
  cmd:   { Icon: VscTerminalBash, color: '#c1f12e', label: 'Batch' },

  // Config / Data
  json:  { Icon: SiJson,        color: '#292929', label: 'JSON' },
  jsonc: { Icon: SiJson,        color: '#292929', label: 'JSON' },
  json5: { Icon: SiJson,        color: '#292929', label: 'JSON' },
  yaml:  { Icon: SiYaml,        color: '#cb171e', label: 'YAML' },
  yml:   { Icon: SiYaml,        color: '#cb171e', label: 'YAML' },
  toml:  { Icon: SiToml,        color: '#9c4121', label: 'TOML' },
  xml:   { Icon: SiHtml5,       color: '#e34f26', label: 'XML' },
  graphql:{ Icon: SiGraphql,    color: '#e10098', label: 'GraphQL' },
  gql:   { Icon: SiGraphql,     color: '#e10098', label: 'GraphQL' },
  sql:   { Icon: DiDatabase,    color: '#e38d13', label: 'SQL' },
  env:   { Icon: VscFile,       color: '#ecd53f', label: 'Env' },
  ini:   { Icon: VscFile,       color: '#8b8b8b', label: 'INI' },
  cfg:   { Icon: VscFile,       color: '#8b8b8b', label: 'Config' },
  conf:  { Icon: VscFile,       color: '#8b8b8b', label: 'Config' },

  // Markdown / Docs
  md:    { Icon: SiMarkdown,    color: '#ffffff', label: 'Markdown' },
  mdx:   { Icon: SiMarkdown,    color: '#fcb32c', label: 'MDX' },
  txt:   { Icon: VscFile,       color: '#8b8b8b', label: 'Text' },
  rst:   { Icon: VscFile,       color: '#8b8b8b', label: 'reStructuredText' },
  tex:   { Icon: VscFile,       color: '#3d6117', label: 'LaTeX' },
  log:   { Icon: VscFile,       color: '#8b8b8b', label: 'Log' },

  // Docker / DevOps
  dockerfile: { Icon: SiDocker, color: '#2496ed', label: 'Dockerfile' },

  // Git
  gitignore:    { Icon: SiGit,  color: '#f05032', label: 'Git Ignore' },
  gitattributes:{ Icon: SiGit,  color: '#f05032', label: 'Git Attributes' },
  gitmodules:   { Icon: SiGit,  color: '#f05032', label: 'Git Modules' },

  // Package managers
  lock:  { Icon: SiNpm,         color: '#cb3837', label: 'Lock File' },

  // Images
  png:   { Icon: VscFileMedia,  color: '#a074c4', label: 'PNG' },
  jpg:   { Icon: VscFileMedia,  color: '#a074c4', label: 'JPEG' },
  jpeg:  { Icon: VscFileMedia,  color: '#a074c4', label: 'JPEG' },
  gif:   { Icon: VscFileMedia,  color: '#a074c4', label: 'GIF' },
  svg:   { Icon: VscFileMedia,  color: '#ffb13b', label: 'SVG' },
  ico:   { Icon: VscFileMedia,  color: '#a074c4', label: 'Icon' },
  webp:  { Icon: VscFileMedia,  color: '#a074c4', label: 'WebP' },
  avif:  { Icon: VscFileMedia,  color: '#a074c4', label: 'AVIF' },
  bmp:   { Icon: VscFileMedia,  color: '#a074c4', label: 'BMP' },

  // Archives
  zip:   { Icon: VscFileZip,    color: '#e4a400', label: 'ZIP' },
  tar:   { Icon: VscFileZip,    color: '#e4a400', label: 'TAR' },
  gz:    { Icon: VscFileZip,    color: '#e4a400', label: 'GZip' },
  rar:   { Icon: VscFileZip,    color: '#e4a400', label: 'RAR' },
  '7z':  { Icon: VscFileZip,    color: '#e4a400', label: '7-Zip' },

  // PDF
  pdf:   { Icon: VscFilePdf,    color: '#e4363a', label: 'PDF' },

  // Fonts
  woff:  { Icon: VscFile,       color: '#e34f26', label: 'WOFF' },
  woff2: { Icon: VscFile,       color: '#e34f26', label: 'WOFF2' },
  ttf:   { Icon: VscFile,       color: '#e34f26', label: 'TTF' },
  otf:   { Icon: VscFile,       color: '#e34f26', label: 'OTF' },
  eot:   { Icon: VscFile,       color: '#e34f26', label: 'EOT' },

  // Tailwind
  'tailwind.config.js':  { Icon: SiTailwindcss, color: '#06b6d4', label: 'Tailwind' },
  'tailwind.config.ts':  { Icon: SiTailwindcss, color: '#06b6d4', label: 'Tailwind' },
  'tailwind.config.mjs': { Icon: SiTailwindcss, color: '#06b6d4', label: 'Tailwind' },
};

// Special filename matches (checked before extension)
const FILENAME_MAP: Record<string, FileIconEntry> = {
  'Dockerfile':        { Icon: SiDocker,       color: '#2496ed', label: 'Dockerfile' },
  'docker-compose.yml':{ Icon: SiDocker,       color: '#2496ed', label: 'Docker Compose' },
  'docker-compose.yaml':{ Icon: SiDocker,      color: '#2496ed', label: 'Docker Compose' },
  'package.json':      { Icon: SiNpm,          color: '#cb3837', label: 'NPM Package' },
  'package-lock.json': { Icon: SiNpm,          color: '#cb3837', label: 'NPM Lock' },
  'tsconfig.json':     { Icon: SiTypescript,    color: '#3178c6', label: 'TS Config' },
  'vite.config.ts':    { Icon: SiTypescript,    color: '#646cff', label: 'Vite Config' },
  'vite.config.js':    { Icon: SiJavascript,   color: '#646cff', label: 'Vite Config' },
  '.eslintrc':         { Icon: VscFile,         color: '#4b32c3', label: 'ESLint' },
  '.eslintrc.js':      { Icon: VscFile,         color: '#4b32c3', label: 'ESLint' },
  '.eslintrc.json':    { Icon: VscFile,         color: '#4b32c3', label: 'ESLint' },
  '.prettierrc':       { Icon: VscFile,         color: '#56b3b4', label: 'Prettier' },
  '.gitignore':        { Icon: SiGit,           color: '#f05032', label: 'Git Ignore' },
  'Makefile':          { Icon: VscTerminalBash,  color: '#6d8086', label: 'Makefile' },
  'Gemfile':           { Icon: SiRuby,          color: '#cc342d', label: 'Gemfile' },
  'Rakefile':          { Icon: SiRuby,          color: '#cc342d', label: 'Rakefile' },
  'Cargo.toml':        { Icon: SiRust,          color: '#dea584', label: 'Cargo' },
  'go.mod':            { Icon: SiGo,            color: '#00add8', label: 'Go Module' },
  'go.sum':            { Icon: SiGo,            color: '#00add8', label: 'Go Sum' },
  'requirements.txt':  { Icon: SiPython,        color: '#3776ab', label: 'Requirements' },
  'setup.py':          { Icon: SiPython,        color: '#3776ab', label: 'Setup' },
  'pyproject.toml':    { Icon: SiPython,        color: '#3776ab', label: 'PyProject' },
  'Pipfile':           { Icon: SiPython,        color: '#3776ab', label: 'Pipfile' },
};

const DEFAULT_ICON: FileIconEntry = { Icon: VscFile, color: '#8b8b8b', label: 'File' };

export function getFileIcon(filePath: string): FileIconEntry {
  // Extract filename
  const lastSlash = filePath.lastIndexOf('/');
  const fileName = lastSlash >= 0 ? filePath.substring(lastSlash + 1) : filePath;

  // Check exact filename match first
  if (FILENAME_MAP[fileName]) return FILENAME_MAP[fileName];

  // Check dot-prefixed files (e.g., .gitignore)
  const dotFile = fileName.startsWith('.') ? fileName.substring(1) : '';
  if (dotFile && EXT_MAP[dotFile]) return EXT_MAP[dotFile];

  // Check extension
  const lastDot = fileName.lastIndexOf('.');
  if (lastDot >= 0) {
    const ext = fileName.substring(lastDot + 1).toLowerCase();
    if (EXT_MAP[ext]) return EXT_MAP[ext];
  }

  return DEFAULT_ICON;
}
