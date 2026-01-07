import QRCode from 'qrcode';
import jsQR from 'jsqr';

// Generate QR code as data URL
export async function generateQRCode(data: string): Promise<string> {
  try {
    return await QRCode.toDataURL(data, {
      width: 256,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
    });
  } catch (error) {
    console.error('Failed to generate QR code:', error);
    throw error;
  }
}

// Decode QR code from image data
export function decodeQRCode(
  imageData: ImageData
): string | null {
  const code = jsQR(imageData.data, imageData.width, imageData.height);
  return code?.data || null;
}

// Build the DM URL for a room
export function buildDmUrl(roomId: string): string {
  const baseUrl = window.location.origin;
  return `${baseUrl}/dm/?room=${roomId}`;
}

// Extract room ID from URL
export function extractRoomIdFromUrl(url: string): string | null {
  try {
    const urlObj = new URL(url);
    return urlObj.searchParams.get('room');
  } catch {
    return null;
  }
}
