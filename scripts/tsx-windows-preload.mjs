// tsx uses process.geteuid when available and otherwise calls os.userInfo().
// Some Windows development hosts return a spurious ENOMEM from os.userInfo().
// Supplying the harmless Unix-style uid avoids that lookup during local startup.
if (process.platform === "win32" && !process.geteuid) {
  process.geteuid = () => 1000;
}
