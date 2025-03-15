export class Formatter {
  public escapeMarkdown(text: string): string {
    return text.replace(/[_*[\]()~`>#+-=|{}.!]/g, '\\$&');
  }

  public formatBold(text: string): string {
    return `*${this.escapeMarkdown(text)}*`;
  }

  public formatItalic(text: string): string {
    return `_${this.escapeMarkdown(text)}_`;
  }

  public formatCode(text: string): string {
    return `\`${this.escapeMarkdown(text)}\``;
  }

  public formatList(items: string[]): string {
    return items.map((item) => `• ${this.escapeMarkdown(item)}`).join('\n');
  }

  public formatTherapeuticPlan(steps: { title: string; content: string }[]): string {
    return steps
      .map(
        (step, index) =>
          `${index + 1}. ${this.formatBold(step.title)}\n${this.escapeMarkdown(step.content)}`,
      )
      .join('\n\n');
  }

  public formatEmergencyResources(): string {
    return (
      this.formatBold('Emergency Resources') +
      '\n\n' +
      this.formatList([
        'Emergency Services: 911',
        'Crisis Text Line: Text HOME to 741741',
        'National Suicide Prevention Lifeline: 1-800-273-8255',
      ]) +
      '\n\n' +
      this.formatItalic('Please reach out to these services if you need immediate help.')
    );
  }

  public formatError(message: string): string {
    return `❌ ${this.escapeMarkdown(message)}`;
  }

  public formatSuccess(message: string): string {
    return `✅ ${this.escapeMarkdown(message)}`;
  }
}
