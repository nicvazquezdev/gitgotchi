// Builds a freedesktop autostart entry (pure, no I/O) that starts a program when the user logs in on Linux.
// Quoting follows the Desktop Entry spec for `Exec`: an argument with a reserved character (a space, for one) goes in
// double quotes, with `"`, a backtick, `$` and `\` escaped; the file is a string too, so `\` is doubled again;
// and a literal `%` is written `%%` (a lone one starts a field code).
const RESERVED = /[\s"'\\<>~|&;$*?#()`%]/;
const ESCAPES = { '"': '\\"', '`': '\\`', $: '\\$', '\\': '\\\\\\\\', '%': '%%' };

const quote = (arg) => (RESERVED.test(arg) ? `"${arg.replace(/["`$\\%]/g, (c) => ESCAPES[c])}"` : arg);

/**
 * @param {{ name: string, args: string[] }} options  `args[0]` is the executable.
 * @returns {string} the `.desktop` file
 */
function autostartEntry({ name, args }) {
  return `[Desktop Entry]
Type=Application
Name=${name}
Exec=${args.map(quote).join(' ')}
Terminal=false
X-GNOME-Autostart-enabled=true
`;
}

module.exports = { autostartEntry };
