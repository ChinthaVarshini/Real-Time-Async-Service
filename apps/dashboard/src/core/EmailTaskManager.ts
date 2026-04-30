/**
 * Email Task Manager
 * Handles email composition, recipient management, and task queuing
 */

import type {
  EmailTaskRequest,
  EmailValidationResult,
  EmailComposition
} from '../types'

export interface EmailTaskConfig {
  maxRecipients: number
  maxSubjectLength: number
  maxBodyLength: number
  fromAddress: string
}

export interface EmailTaskManager {
  addRecipients(emails: string[]): void
  removeRecipient(index: number): void
  setSubject(subject: string): void
  setBody(body: string): void
  queueEmailTask(): Promise<void>
  validateEmail(email: string): boolean
  getRecipientCount(): number
  clearAll(): void
}

export class EmailTaskHandler implements EmailTaskManager {
  private recipients: string[] = []
  private subject: string = ''
  private body: string = ''
  private config: EmailTaskConfig
  private onQueue?: (request: EmailTaskRequest) => Promise<void>

  constructor(config: EmailTaskConfig) {
    this.config = config
  }

  /**
   * Set email queue callback function
   */
  setQueueHandler(handler: (request: EmailTaskRequest) => Promise<void>): void {
    this.onQueue = handler
  }

  /**
   * Add recipients with validation and deduplication
   */
  addRecipients(emails: string[]): void {
    const validEmails = emails
      .map(email => email.trim())
      .filter(email => email.length > 0)
      .filter(email => this.validateEmail(email))
      .filter(email => !this.recipients.includes(email)) // Deduplicate

    const remainingSlots = this.config.maxRecipients - this.recipients.length
    const emailsToAdd = validEmails.slice(0, remainingSlots)

    this.recipients.push(...emailsToAdd)

    if (validEmails.length > emailsToAdd.length) {
      console.warn(`Only added ${emailsToAdd.length} of ${validEmails.length} emails due to recipient limit`)
    }
  }

  /**
   * Remove recipient by index
   */
  removeRecipient(index: number): void {
    if (index >= 0 && index < this.recipients.length) {
      this.recipients.splice(index, 1)
    }
  }

  /**
   * Set email subject with length validation
   */
  setSubject(subject: string): void {
    this.subject = subject.slice(0, this.config.maxSubjectLength)
  }

  /**
   * Set email body with length validation
   */
  setBody(body: string): void {
    this.body = body.slice(0, this.config.maxBodyLength)
  }

  /**
   * Queue email task for processing
   */
  async queueEmailTask(): Promise<void> {
    const validation = this.validateComposition()
    if (!validation.valid) {
      throw new Error(validation.error)
    }

    if (!this.onQueue) {
      throw new Error('No queue handler configured')
    }

    const request: EmailTaskRequest = {
      jsonrpc: '2.0',
      method: 'email.send',
      params: {
        recipients: [...this.recipients],
        subject: this.subject,
        body: this.body
      },
      id: Date.now()
    }

    await this.onQueue(request)
  }

  /**
   * Validate email address format
   */
  validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email.trim())
  }

  /**
   * Get current recipient count
   */
  getRecipientCount(): number {
    return this.recipients.length
  }

  /**
   * Clear all email data
   */
  clearAll(): void {
    this.recipients = []
    this.subject = ''
    this.body = ''
  }

  /**
   * Get current email composition
   */
  getComposition(): EmailComposition {
    return {
      recipients: [...this.recipients],
      subject: this.subject,
      body: this.body
    }
  }

  /**
   * Set complete email composition
   */
  setComposition(composition: Partial<EmailComposition>): void {
    if (composition.recipients) {
      this.recipients = []
      this.addRecipients(composition.recipients)
    }
    if (composition.subject !== undefined) {
      this.setSubject(composition.subject)
    }
    if (composition.body !== undefined) {
      this.setBody(composition.body)
    }
  }

  /**
   * Parse email addresses from text input
   */
  parseEmailsFromText(text: string): string[] {
    // Split by comma, semicolon, or newline
    return text
      .split(/[,;\n]+/)
      .map(email => email.trim())
      .filter(email => email.length > 0)
  }

  /**
   * Validate email addresses in bulk
   */
  validateEmails(emails: string[]): EmailValidationResult[] {
    return emails.map(email => ({
      email: email.trim(),
      valid: this.validateEmail(email),
      error: this.validateEmail(email) ? undefined : 'Invalid email format'
    }))
  }

  /**
   * Get recipient validation results
   */
  getRecipientValidation(): EmailValidationResult[] {
    return this.validateEmails(this.recipients)
  }

  /**
   * Validate complete email composition
   */
  private validateComposition(): { valid: boolean; error?: string } {
    if (this.recipients.length === 0) {
      return { valid: false, error: 'At least one recipient is required' }
    }

    if (this.subject.trim().length === 0) {
      return { valid: false, error: 'Subject is required' }
    }

    if (this.body.trim().length === 0) {
      return { valid: false, error: 'Message body is required' }
    }

    // Validate all recipients
    const invalidRecipients = this.recipients.filter(email => !this.validateEmail(email))
    if (invalidRecipients.length > 0) {
      return { 
        valid: false, 
        error: `Invalid email addresses: ${invalidRecipients.join(', ')}` 
      }
    }

    return { valid: true }
  }

  /**
   * Get from address (read-only)
   */
  getFromAddress(): string {
    return this.config.fromAddress
  }

  /**
   * Get subject with length info
   */
  getSubjectInfo(): { text: string; length: number; maxLength: number; remaining: number } {
    return {
      text: this.subject,
      length: this.subject.length,
      maxLength: this.config.maxSubjectLength,
      remaining: this.config.maxSubjectLength - this.subject.length
    }
  }

  /**
   * Get body with length info
   */
  getBodyInfo(): { text: string; length: number; maxLength: number; remaining: number } {
    return {
      text: this.body,
      length: this.body.length,
      maxLength: this.config.maxBodyLength,
      remaining: this.config.maxBodyLength - this.body.length
    }
  }

  /**
   * Check if at maximum recipients
   */
  isAtMaxRecipients(): boolean {
    return this.recipients.length >= this.config.maxRecipients
  }

  /**
   * Get remaining recipient slots
   */
  getRemainingRecipientSlots(): number {
    return Math.max(0, this.config.maxRecipients - this.recipients.length)
  }
}