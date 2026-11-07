import { inflateRawSync } from 'node:zlib'

/**
 * Đọc một file trong zip (.xlsx là zip) chỉ bằng `node:zlib`, để test kiểm được
 * nội dung thật mà không thêm dependency giải nén.
 *
 * Đi theo central directory thay vì local header, vì zip có thể ghi kích thước
 * ở data descriptor sau dữ liệu và để 0 trong local header.
 */
export function readZipEntry(zip: Buffer, name: string): string | undefined {
  const eocd = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))

  if (eocd < 0) throw new Error('không phải file zip')

  const entryCount = zip.readUInt16LE(eocd + 10)
  let offset = zip.readUInt32LE(eocd + 16)

  for (let index = 0; index < entryCount; index += 1) {
    const method = zip.readUInt16LE(offset + 10)
    const compressedSize = zip.readUInt32LE(offset + 20)
    const nameLength = zip.readUInt16LE(offset + 28)
    const extraLength = zip.readUInt16LE(offset + 30)
    const commentLength = zip.readUInt16LE(offset + 32)
    const localOffset = zip.readUInt32LE(offset + 42)
    const entryName = zip.toString('utf8', offset + 46, offset + 46 + nameLength)

    if (entryName === name) {
      const dataStart =
        localOffset + 30 + zip.readUInt16LE(localOffset + 26) + zip.readUInt16LE(localOffset + 28)
      const data = zip.subarray(dataStart, dataStart + compressedSize)

      return (method === 8 ? inflateRawSync(data) : data).toString('utf8')
    }

    offset += 46 + nameLength + extraLength + commentLength
  }

  return undefined
}
