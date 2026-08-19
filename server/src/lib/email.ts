// Minimal EmailService interface so the app is usable before any SMTP/transactional
// email provider is configured. The console implementation logs the link instead of
// sending it — swap `emailService` for a real provider implementing the same
// interface once credentials are available; no call site needs to change.
export interface EmailService {
  sendPasswordSetup(to: string, name: string, setupUrl: string): Promise<void>;
}

class ConsoleEmailService implements EmailService {
  async sendPasswordSetup(to: string, name: string, setupUrl: string): Promise<void> {
    console.log("=".repeat(60));
    console.log(`[email:stub] Password setup link for ${name} <${to}>`);
    console.log(setupUrl);
    console.log("=".repeat(60));
  }
}

export const emailService: EmailService = new ConsoleEmailService();
