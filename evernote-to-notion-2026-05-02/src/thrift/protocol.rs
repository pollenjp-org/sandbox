//! Minimal Apache Thrift Binary Protocol implementation, just enough to call
//! Evernote NoteStore / UserStore endpoints.
//!
//! Reference: <https://github.com/apache/thrift/blob/master/doc/specs/thrift-binary-protocol.md>

use bytes::{Buf, BufMut, Bytes, BytesMut};

const VERSION_MASK: u32 = 0xffff_0000;
const VERSION_1: u32 = 0x8001_0000;

#[derive(Debug, thiserror::Error)]
pub enum ProtocolError {
    #[error("unexpected end of buffer")]
    Eof,
    #[error("invalid message version: {0:#x}")]
    InvalidVersion(u32),
    #[error("invalid type id: {0}")]
    InvalidType(u8),
    #[error("invalid message type: {0}")]
    InvalidMessageType(u8),
    #[error("invalid utf8 string: {0}")]
    Utf8(#[from] std::string::FromUtf8Error),
    #[error("size out of range: {0}")]
    InvalidSize(i32),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum ThriftType {
    Stop = 0,
    Void = 1,
    Bool = 2,
    Byte = 3,
    Double = 4,
    I16 = 6,
    I32 = 8,
    I64 = 10,
    String = 11,
    Struct = 12,
    Map = 13,
    Set = 14,
    List = 15,
}

impl ThriftType {
    pub fn from_u8(v: u8) -> Result<Self, ProtocolError> {
        Ok(match v {
            0 => Self::Stop,
            1 => Self::Void,
            2 => Self::Bool,
            3 => Self::Byte,
            4 => Self::Double,
            6 => Self::I16,
            8 => Self::I32,
            10 => Self::I64,
            11 => Self::String,
            12 => Self::Struct,
            13 => Self::Map,
            14 => Self::Set,
            15 => Self::List,
            other => return Err(ProtocolError::InvalidType(other)),
        })
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum MessageType {
    Call = 1,
    Reply = 2,
    Exception = 3,
    Oneway = 4,
}

impl MessageType {
    pub fn from_u8(v: u8) -> Result<Self, ProtocolError> {
        Ok(match v {
            1 => Self::Call,
            2 => Self::Reply,
            3 => Self::Exception,
            4 => Self::Oneway,
            other => return Err(ProtocolError::InvalidMessageType(other)),
        })
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct FieldHeader {
    pub ty: ThriftType,
    pub id: i16,
}

#[derive(Debug, Default)]
pub struct BinaryProtocolWriter {
    buf: BytesMut,
}

impl BinaryProtocolWriter {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn into_bytes(self) -> Bytes {
        self.buf.freeze()
    }

    pub fn write_message_begin(&mut self, name: &str, ty: MessageType, seq_id: i32) {
        let version = VERSION_1 | (ty as u32 & 0xff);
        self.buf.put_u32(version);
        self.write_string(name);
        self.buf.put_i32(seq_id);
    }

    pub fn write_message_end(&mut self) {}

    pub fn write_struct_begin(&mut self) {}
    pub fn write_struct_end(&mut self) {}

    pub fn write_field_begin(&mut self, ty: ThriftType, id: i16) {
        self.buf.put_u8(ty as u8);
        self.buf.put_i16(id);
    }
    pub fn write_field_end(&mut self) {}
    pub fn write_field_stop(&mut self) {
        self.buf.put_u8(ThriftType::Stop as u8);
    }

    pub fn write_bool(&mut self, v: bool) {
        self.buf.put_u8(u8::from(v));
    }
    pub fn write_byte(&mut self, v: i8) {
        self.buf.put_i8(v);
    }
    pub fn write_i16(&mut self, v: i16) {
        self.buf.put_i16(v);
    }
    pub fn write_i32(&mut self, v: i32) {
        self.buf.put_i32(v);
    }
    pub fn write_i64(&mut self, v: i64) {
        self.buf.put_i64(v);
    }
    pub fn write_double(&mut self, v: f64) {
        self.buf.put_f64(v);
    }
    pub fn write_string(&mut self, s: &str) {
        self.write_binary(s.as_bytes());
    }
    pub fn write_binary(&mut self, b: &[u8]) {
        self.buf.put_i32(b.len() as i32);
        self.buf.put_slice(b);
    }
    pub fn write_list_begin(&mut self, elem: ThriftType, size: i32) {
        self.buf.put_u8(elem as u8);
        self.buf.put_i32(size);
    }
    pub fn write_list_end(&mut self) {}
}

#[derive(Debug)]
pub struct BinaryProtocolReader<B: Buf> {
    buf: B,
}

impl<B: Buf> BinaryProtocolReader<B> {
    pub fn new(buf: B) -> Self {
        Self { buf }
    }

    fn need(&self, n: usize) -> Result<(), ProtocolError> {
        if self.buf.remaining() < n {
            Err(ProtocolError::Eof)
        } else {
            Ok(())
        }
    }

    pub fn read_message_begin(&mut self) -> Result<(String, MessageType, i32), ProtocolError> {
        self.need(4)?;
        let header = self.buf.get_u32();
        if header & VERSION_MASK != VERSION_1 {
            return Err(ProtocolError::InvalidVersion(header));
        }
        let mt = MessageType::from_u8((header & 0xff) as u8)?;
        let name = self.read_string()?;
        self.need(4)?;
        let seq_id = self.buf.get_i32();
        Ok((name, mt, seq_id))
    }
    pub fn read_message_end(&mut self) {}

    pub fn read_struct_begin(&mut self) {}
    pub fn read_struct_end(&mut self) {}

    pub fn read_field_begin(&mut self) -> Result<FieldHeader, ProtocolError> {
        self.need(1)?;
        let raw = self.buf.get_u8();
        let ty = ThriftType::from_u8(raw)?;
        if ty == ThriftType::Stop {
            return Ok(FieldHeader { ty, id: 0 });
        }
        self.need(2)?;
        let id = self.buf.get_i16();
        Ok(FieldHeader { ty, id })
    }
    pub fn read_field_end(&mut self) {}

    pub fn read_bool(&mut self) -> Result<bool, ProtocolError> {
        self.need(1)?;
        Ok(self.buf.get_u8() != 0)
    }
    pub fn read_byte(&mut self) -> Result<i8, ProtocolError> {
        self.need(1)?;
        Ok(self.buf.get_i8())
    }
    pub fn read_i16(&mut self) -> Result<i16, ProtocolError> {
        self.need(2)?;
        Ok(self.buf.get_i16())
    }
    pub fn read_i32(&mut self) -> Result<i32, ProtocolError> {
        self.need(4)?;
        Ok(self.buf.get_i32())
    }
    pub fn read_i64(&mut self) -> Result<i64, ProtocolError> {
        self.need(8)?;
        Ok(self.buf.get_i64())
    }
    pub fn read_double(&mut self) -> Result<f64, ProtocolError> {
        self.need(8)?;
        Ok(self.buf.get_f64())
    }
    pub fn read_string(&mut self) -> Result<String, ProtocolError> {
        let bytes = self.read_binary()?;
        Ok(String::from_utf8(bytes)?)
    }
    pub fn read_binary(&mut self) -> Result<Vec<u8>, ProtocolError> {
        self.need(4)?;
        let len = self.buf.get_i32();
        if len < 0 {
            return Err(ProtocolError::InvalidSize(len));
        }
        let len = len as usize;
        self.need(len)?;
        let mut out = vec![0u8; len];
        self.buf.copy_to_slice(&mut out);
        Ok(out)
    }
    pub fn read_list_begin(&mut self) -> Result<(ThriftType, i32), ProtocolError> {
        self.need(5)?;
        let ty = ThriftType::from_u8(self.buf.get_u8())?;
        let size = self.buf.get_i32();
        Ok((ty, size))
    }
    pub fn read_list_end(&mut self) {}

    /// Skip a field of known type. Used to silently ignore unknown / unwanted struct fields.
    pub fn skip(&mut self, ty: ThriftType) -> Result<(), ProtocolError> {
        match ty {
            ThriftType::Stop | ThriftType::Void => Ok(()),
            ThriftType::Bool | ThriftType::Byte => {
                self.need(1)?;
                self.buf.advance(1);
                Ok(())
            }
            ThriftType::I16 => {
                self.need(2)?;
                self.buf.advance(2);
                Ok(())
            }
            ThriftType::I32 => {
                self.need(4)?;
                self.buf.advance(4);
                Ok(())
            }
            ThriftType::Double | ThriftType::I64 => {
                self.need(8)?;
                self.buf.advance(8);
                Ok(())
            }
            ThriftType::String => {
                let _ = self.read_binary()?;
                Ok(())
            }
            ThriftType::Struct => loop {
                let h = self.read_field_begin()?;
                if h.ty == ThriftType::Stop {
                    return Ok(());
                }
                self.skip(h.ty)?;
            },
            ThriftType::List | ThriftType::Set => {
                let (elem, size) = self.read_list_begin()?;
                for _ in 0..size {
                    self.skip(elem)?;
                }
                Ok(())
            }
            ThriftType::Map => {
                self.need(6)?;
                let key = ThriftType::from_u8(self.buf.get_u8())?;
                let val = ThriftType::from_u8(self.buf.get_u8())?;
                let size = self.buf.get_i32();
                for _ in 0..size {
                    self.skip(key)?;
                    self.skip(val)?;
                }
                Ok(())
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use bytes::Bytes;

    #[test]
    fn message_roundtrip_with_string_field() {
        let mut w = BinaryProtocolWriter::new();
        w.write_message_begin("getUser", MessageType::Call, 7);
        w.write_struct_begin();
        w.write_field_begin(ThriftType::String, 1);
        w.write_string("hello");
        w.write_field_end();
        w.write_field_stop();
        w.write_struct_end();
        w.write_message_end();

        let bytes = w.into_bytes();
        let mut r = BinaryProtocolReader::new(bytes);
        let (name, mt, seq) = r.read_message_begin().unwrap();
        assert_eq!(name, "getUser");
        assert_eq!(mt, MessageType::Call);
        assert_eq!(seq, 7);
        r.read_struct_begin();
        let f = r.read_field_begin().unwrap();
        assert_eq!(f.ty, ThriftType::String);
        assert_eq!(f.id, 1);
        assert_eq!(r.read_string().unwrap(), "hello");
        let stop = r.read_field_begin().unwrap();
        assert_eq!(stop.ty, ThriftType::Stop);
    }

    #[test]
    fn list_roundtrip() {
        let mut w = BinaryProtocolWriter::new();
        w.write_list_begin(ThriftType::I32, 3);
        w.write_i32(1);
        w.write_i32(2);
        w.write_i32(3);
        w.write_list_end();

        let mut r = BinaryProtocolReader::new(w.into_bytes());
        let (ty, size) = r.read_list_begin().unwrap();
        assert_eq!(ty, ThriftType::I32);
        assert_eq!(size, 3);
        assert_eq!(r.read_i32().unwrap(), 1);
        assert_eq!(r.read_i32().unwrap(), 2);
        assert_eq!(r.read_i32().unwrap(), 3);
    }

    #[test]
    fn skip_unknown_struct() {
        let mut w = BinaryProtocolWriter::new();
        w.write_struct_begin();
        w.write_field_begin(ThriftType::I32, 1);
        w.write_i32(42);
        w.write_field_end();
        w.write_field_begin(ThriftType::String, 2);
        w.write_string("ignored");
        w.write_field_end();
        w.write_field_stop();
        w.write_struct_end();

        let mut r = BinaryProtocolReader::new(w.into_bytes());
        r.read_struct_begin();
        let f = r.read_field_begin().unwrap();
        assert_eq!(f.id, 1);
        r.skip(f.ty).unwrap();
        let f = r.read_field_begin().unwrap();
        assert_eq!(f.id, 2);
        r.skip(f.ty).unwrap();
        let stop = r.read_field_begin().unwrap();
        assert_eq!(stop.ty, ThriftType::Stop);
    }

    #[test]
    fn rejects_invalid_version() {
        let mut buf = BytesMut::new();
        buf.put_u32(0x0000_0001);
        buf.put_i32(0); // empty name
        buf.put_i32(0);
        let mut r = BinaryProtocolReader::new(Bytes::from(buf));
        let err = r.read_message_begin().unwrap_err();
        matches!(err, ProtocolError::InvalidVersion(_));
    }
}
