/**
 * File Upload Handler
 * Manages multi-format file upload, validation, and processing
 */

import type {
  FileDescriptor,
  FileUploadRequest,
  FileValidationResult,
  FilePreview
} from '../types'

export interface FileUploadConfig {
  maxFileSize: number
  maxFiles: number
  supportedFormats: string[]
  chunkSize: number
}

export interface FileUploadHandler {
  addFiles(files: File[]): void
  removeFile(index: number): void
  clearFiles(): void
  uploadFiles(): Promise<void>
  getSupportedFormats(): string[]
  getSelectedFiles(): FileDescriptor[]
  getFilePreviews(): FilePreview[]
  validateFile(file: File): FileValidationResult
}

export class FileUploadManager implements FileUploadHandler {
  private selectedFiles: File[] = []
  private config: FileUploadConfig
  private onUpload?: (files: FileDescriptor[]) => Promise<void>

  constructor(config: FileUploadConfig) {
    this.config = config
  }

  /**
   * Set upload callback function
   */
  setUploadHandler(handler: (files: FileDescriptor[]) => Promise<void>): void {
    this.onUpload = handler
  }

  /**
   * Add files to selection with validation
   */
  addFiles(files: File[]): void {
    const remainingSlots = this.config.maxFiles - this.selectedFiles.length
    const filesToAdd = files.slice(0, remainingSlots)

    for (const file of filesToAdd) {
      const validation = this.validateFile(file)
      if (validation.valid) {
        this.selectedFiles.push(file)
      } else {
        console.warn(`File ${file.name} rejected: ${validation.error}`)
      }
    }
  }

  /**
   * Remove file from selection by index
   */
  removeFile(index: number): void {
    if (index >= 0 && index < this.selectedFiles.length) {
      this.selectedFiles.splice(index, 1)
    }
  }

  /**
   * Clear all selected files
   */
  clearFiles(): void {
    this.selectedFiles = []
  }

  /**
   * Upload all selected files
   */
  async uploadFiles(): Promise<void> {
    if (this.selectedFiles.length === 0) {
      throw new Error('No files selected for upload')
    }

    if (!this.onUpload) {
      throw new Error('No upload handler configured')
    }

    const fileDescriptors = await this.convertFilesToDescriptors(this.selectedFiles)
    await this.onUpload(fileDescriptors)
  }

  /**
   * Get supported file formats
   */
  getSupportedFormats(): string[] {
    return [...this.config.supportedFormats]
  }

  /**
   * Get selected files as descriptors
   */
  getSelectedFiles(): FileDescriptor[] {
    return this.selectedFiles.map(file => ({
      filename: file.name,
      mimeType: file.type || 'application/octet-stream',
      size: file.size,
      data: '' // Will be populated during upload
    }))
  }

  /**
   * Get file previews with validation results
   */
  getFilePreviews(): FilePreview[] {
    return this.selectedFiles.map(file => ({
      file,
      icon: this.getFileIcon(file.name),
      validationResult: this.validateFile(file),
      preview: this.isImageFile(file) ? undefined : undefined // Preview will be generated on demand
    }))
  }

  /**
   * Validate individual file
   */
  validateFile(file: File): FileValidationResult {
    // Check file size
    if (file.size > this.config.maxFileSize) {
      return {
        valid: false,
        error: `File size ${this.formatFileSize(file.size)} exceeds maximum ${this.formatFileSize(this.config.maxFileSize)}`
      }
    }

    // Check file format
    const extension = this.getFileExtension(file.name).toLowerCase()
    const mimeType = file.type.toLowerCase()
    
    const isFormatSupported = this.config.supportedFormats.some(format => {
      const formatLower = format.toLowerCase()
      return extension === formatLower || 
             mimeType.includes(formatLower) ||
             (formatLower === '*' || formatLower === '*/*')
    })

    if (!isFormatSupported) {
      return {
        valid: false,
        error: `File format .${extension} is not supported`
      }
    }

    // Additional validations
    const warnings: string[] = []
    
    if (file.size === 0) {
      return {
        valid: false,
        error: 'File is empty'
      }
    }

    if (file.name.length > 255) {
      warnings.push('Filename is very long and may cause issues')
    }

    return {
      valid: true,
      warnings: warnings.length > 0 ? warnings : undefined
    }
  }

  /**
   * Convert files to base64 descriptors
   */
  private async convertFilesToDescriptors(files: File[]): Promise<FileDescriptor[]> {
    const descriptors: FileDescriptor[] = []

    for (const file of files) {
      try {
        const data = await this.fileToBase64(file)
        descriptors.push({
          filename: file.name,
          mimeType: file.type || 'application/octet-stream',
          size: file.size,
          data
        })
      } catch (error) {
        console.error(`Failed to convert file ${file.name}:`, error)
        throw new Error(`Failed to process file: ${file.name}`)
      }
    }

    return descriptors
  }

  /**
   * Convert file to base64 string
   */
  private fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      
      reader.onload = () => {
        const result = reader.result as string
        // Remove data URL prefix to get just the base64 data
        const base64Data = result.split(',')[1]
        resolve(base64Data)
      }
      
      reader.onerror = () => {
        reject(new Error('Failed to read file'))
      }
      
      reader.readAsDataURL(file)
    })
  }

  /**
   * Get file extension from filename
   */
  private getFileExtension(filename: string): string {
    const lastDot = filename.lastIndexOf('.')
    return lastDot > 0 ? filename.substring(lastDot + 1) : ''
  }

  /**
   * Check if file is an image
   */
  private isImageFile(file: File): boolean {
    return file.type.startsWith('image/') || 
           ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(
             this.getFileExtension(file.name).toLowerCase()
           )
  }

  /**
   * Get appropriate icon for file type
   */
  private getFileIcon(filename: string): string {
    const extension = this.getFileExtension(filename).toLowerCase()
    
    const iconMap: Record<string, string> = {
      // Images
      'jpg': '🖼️', 'jpeg': '🖼️', 'png': '🖼️', 'gif': '🖼️', 
      'webp': '🖼️', 'svg': '🖼️', 'bmp': '🖼️',
      
      // Videos
      'mp4': '🎬', 'mov': '🎬', 'avi': '🎬', 'mkv': '🎬', 'webm': '🎬',
      
      // Audio
      'mp3': '🎵', 'wav': '🎵', 'ogg': '🎵', 'flac': '🎵',
      
      // Documents
      'pdf': '📕',
      'doc': '📝', 'docx': '📝',
      'xls': '📊', 'xlsx': '📊',
      'csv': '📋',
      
      // Archives
      'zip': '🗜️', 'rar': '🗜️', '7z': '🗜️', 'tar': '🗜️', 'gz': '🗜️',
      
      // Code
      'js': '💻', 'ts': '💻', 'py': '💻', 'java': '💻', 'go': '💻', 'rs': '💻'
    }

    return iconMap[extension] || '📄'
  }

  /**
   * Format file size for display
   */
  private formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`
    return `${(bytes / 1073741824).toFixed(2)} GB`
  }

  /**
   * Get current file count
   */
  getFileCount(): number {
    return this.selectedFiles.length
  }

  /**
   * Get total size of selected files
   */
  getTotalSize(): number {
    return this.selectedFiles.reduce((total, file) => total + file.size, 0)
  }

  /**
   * Check if at maximum file limit
   */
  isAtMaxFiles(): boolean {
    return this.selectedFiles.length >= this.config.maxFiles
  }
}