export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startTaskBackupCron } = await import(
      "./infrastructure/task-backups/task-backup-cron"
    );

    startTaskBackupCron();
  }
}
