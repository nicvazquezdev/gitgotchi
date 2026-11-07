// Builds a macOS LaunchAgent plist (pure, no I/O) that starts a program when the user logs in.
const escapeXml = (s) =>
  String(s).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]);

/**
 * @param {{ label: string, args: string[] }} options  `args[0]` is the executable.
 * @returns {string} plist XML
 */
function launchAgentPlist({ label, args }) {
  const argList = args.map((a) => `    <string>${escapeXml(a)}</string>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${escapeXml(label)}</string>
  <key>ProgramArguments</key>
  <array>
${argList}
  </array>
  <key>RunAtLoad</key>
  <true/>
</dict>
</plist>
`;
}

module.exports = { launchAgentPlist };
