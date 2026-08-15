use std::sync::Arc;
use std::sync::atomic::{AtomicI32, Ordering};
use std::time::Duration;

use bytes::Bytes;

use super::types::{Note, NoteMetadata, NotesMetadataList, Resource, ResourceData, User};
use crate::rate_limit::TokenBucket;
use crate::thrift::{
    BinaryProtocolReader, BinaryProtocolWriter, FieldHeader, HttpTransport, MessageType,
    ProtocolError, ThriftType, TransportError,
};

#[derive(Debug, thiserror::Error)]
pub enum EvernoteError {
    #[error("transport: {0}")]
    Transport(#[from] TransportError),
    #[error("protocol: {0}")]
    Protocol(#[from] ProtocolError),
    #[error("evernote user error code={code} message={message:?}")]
    User { code: i32, message: Option<String> },
    #[error(
        "evernote system error code={code} message={message:?} rateLimitDuration={rate_limit_duration:?}"
    )]
    System {
        code: i32,
        message: Option<String>,
        rate_limit_duration: Option<i32>,
    },
    #[error("evernote not-found identifier={identifier:?} key={key:?}")]
    NotFound {
        identifier: Option<String>,
        key: Option<String>,
    },
    #[error("server returned exception message: {0}")]
    AppException(String),
    #[error("malformed response: {0}")]
    Malformed(String),
}

#[derive(Debug)]
pub struct EvernoteClient {
    note_store: HttpTransport,
    user_store: HttpTransport,
    auth_token: String,
    seq: AtomicI32,
    limiter: Arc<TokenBucket>,
}

impl EvernoteClient {
    pub fn new(
        note_store: HttpTransport,
        user_store: HttpTransport,
        auth_token: impl Into<String>,
        limiter: Arc<TokenBucket>,
    ) -> Self {
        Self {
            note_store,
            user_store,
            auth_token: auth_token.into(),
            seq: AtomicI32::new(1),
            limiter,
        }
    }

    fn next_seq(&self) -> i32 {
        self.seq.fetch_add(1, Ordering::Relaxed)
    }

    async fn call(
        &self,
        store: &HttpTransport,
        method: &str,
        write_args: impl FnOnce(&mut BinaryProtocolWriter),
    ) -> Result<Bytes, EvernoteError> {
        self.limiter.acquire().await;
        let seq = self.next_seq();
        let mut w = BinaryProtocolWriter::new();
        w.write_message_begin(method, MessageType::Call, seq);
        write_args(&mut w);
        w.write_message_end();
        let bytes = w.into_bytes();
        let resp = store.call(bytes).await?;
        Ok(resp)
    }

    fn read_reply<T>(
        bytes: Bytes,
        method: &str,
        read_success: impl FnOnce(&mut BinaryProtocolReader<Bytes>) -> Result<T, EvernoteError>,
    ) -> Result<T, EvernoteError> {
        let mut r = BinaryProtocolReader::new(bytes);
        let (_name, mt, _seq) = r.read_message_begin()?;
        match mt {
            MessageType::Reply => {
                r.read_struct_begin();
                let mut read_success = Some(read_success);
                let mut result: Option<Result<T, EvernoteError>> = None;
                loop {
                    let f = r.read_field_begin()?;
                    if f.ty == ThriftType::Stop {
                        break;
                    }
                    if f.id == 0 {
                        let cb = read_success.take().ok_or_else(|| {
                            EvernoteError::Malformed(format!("{method}: duplicate result field"))
                        })?;
                        result = Some(cb(&mut r));
                    } else {
                        let err = read_known_exception(&mut r, f)?;
                        return Err(err);
                    }
                    r.read_field_end();
                }
                r.read_struct_end();
                r.read_message_end();
                result.ok_or_else(|| EvernoteError::Malformed(format!("{method}: no result")))?
            }
            MessageType::Exception => {
                let msg = read_app_exception(&mut r)?;
                Err(EvernoteError::AppException(msg))
            }
            other => Err(EvernoteError::Malformed(format!(
                "unexpected message type: {other:?}"
            ))),
        }
    }

    /// UserStore.getUser(authenticationToken)
    pub async fn get_user(&self) -> Result<User, EvernoteError> {
        let token = self.auth_token.clone();
        let resp = self
            .call(&self.user_store, "getUser", |w| {
                w.write_struct_begin();
                w.write_field_begin(ThriftType::String, 1);
                w.write_string(&token);
                w.write_field_end();
                w.write_field_stop();
                w.write_struct_end();
            })
            .await?;
        Self::read_reply(resp, "getUser", read_user)
    }

    /// NoteStore.findNotesMetadata(token, filter, offset, maxNotes, resultSpec)
    /// `filter` is sent as an empty NoteFilter — the server returns the user's
    /// notes ordered by UPDATED desc by default.
    /// `resultSpec` requests title + updated.
    pub async fn find_notes_metadata(
        &self,
        offset: i32,
        max_notes: i32,
    ) -> Result<NotesMetadataList, EvernoteError> {
        let token = self.auth_token.clone();
        let resp = self
            .call(&self.note_store, "findNotesMetadata", |w| {
                w.write_struct_begin();
                // 1: authenticationToken
                w.write_field_begin(ThriftType::String, 1);
                w.write_string(&token);
                w.write_field_end();
                // 2: filter (empty struct)
                w.write_field_begin(ThriftType::Struct, 2);
                w.write_struct_begin();
                w.write_field_stop();
                w.write_struct_end();
                w.write_field_end();
                // 3: offset
                w.write_field_begin(ThriftType::I32, 3);
                w.write_i32(offset);
                w.write_field_end();
                // 4: maxNotes
                w.write_field_begin(ThriftType::I32, 4);
                w.write_i32(max_notes);
                w.write_field_end();
                // 5: resultSpec
                w.write_field_begin(ThriftType::Struct, 5);
                w.write_struct_begin();
                // includeTitle = true (id=1)
                w.write_field_begin(ThriftType::Bool, 1);
                w.write_bool(true);
                w.write_field_end();
                // includeUpdated = true (id=5)
                w.write_field_begin(ThriftType::Bool, 5);
                w.write_bool(true);
                w.write_field_end();
                w.write_field_stop();
                w.write_struct_end();
                w.write_field_end();
                w.write_field_stop();
                w.write_struct_end();
            })
            .await?;
        Self::read_reply(resp, "findNotesMetadata", read_notes_metadata_list)
    }

    /// NoteStore.getNote(token, guid, withContent, withResourcesData, withResourcesRecognition, withResourcesAlternateData)
    pub async fn get_note(
        &self,
        guid: &str,
        with_content: bool,
        with_resources_data: bool,
    ) -> Result<Note, EvernoteError> {
        let token = self.auth_token.clone();
        let guid_owned = guid.to_string();
        let resp = self
            .call(&self.note_store, "getNote", |w| {
                w.write_struct_begin();
                w.write_field_begin(ThriftType::String, 1);
                w.write_string(&token);
                w.write_field_end();
                w.write_field_begin(ThriftType::String, 2);
                w.write_string(&guid_owned);
                w.write_field_end();
                w.write_field_begin(ThriftType::Bool, 3);
                w.write_bool(with_content);
                w.write_field_end();
                w.write_field_begin(ThriftType::Bool, 4);
                w.write_bool(with_resources_data);
                w.write_field_end();
                w.write_field_begin(ThriftType::Bool, 5);
                w.write_bool(false);
                w.write_field_end();
                w.write_field_begin(ThriftType::Bool, 6);
                w.write_bool(false);
                w.write_field_end();
                w.write_field_stop();
                w.write_struct_end();
            })
            .await?;
        Self::read_reply(resp, "getNote", read_note)
    }

    /// NoteStore.getResource(token, guid, withData, withRecognition, withAttributes, withAlternateData)
    pub async fn get_resource(&self, guid: &str) -> Result<ResourceData, EvernoteError> {
        let token = self.auth_token.clone();
        let guid_owned = guid.to_string();
        let resp = self
            .call(&self.note_store, "getResource", |w| {
                w.write_struct_begin();
                w.write_field_begin(ThriftType::String, 1);
                w.write_string(&token);
                w.write_field_end();
                w.write_field_begin(ThriftType::String, 2);
                w.write_string(&guid_owned);
                w.write_field_end();
                w.write_field_begin(ThriftType::Bool, 3);
                w.write_bool(true);
                w.write_field_end();
                w.write_field_begin(ThriftType::Bool, 4);
                w.write_bool(false);
                w.write_field_end();
                w.write_field_begin(ThriftType::Bool, 5);
                w.write_bool(true);
                w.write_field_end();
                w.write_field_begin(ThriftType::Bool, 6);
                w.write_bool(false);
                w.write_field_end();
                w.write_field_stop();
                w.write_struct_end();
            })
            .await?;
        Self::read_reply(resp, "getResource", read_resource_data)
    }

    /// On rate-limit errors, sleep for the duration the server requested
    /// (capped) before letting the caller retry.
    pub async fn handle_rate_limit(err: &EvernoteError) -> Option<Duration> {
        if let EvernoteError::System {
            rate_limit_duration: Some(secs),
            ..
        } = err
        {
            let d = Duration::from_secs((*secs as u64).min(3600));
            tokio::time::sleep(d).await;
            Some(d)
        } else {
            None
        }
    }
}

// --- Result-struct readers -------------------------------------------------

fn read_user(r: &mut BinaryProtocolReader<Bytes>) -> Result<User, EvernoteError> {
    r.read_struct_begin();
    let mut id: Option<i32> = None;
    let mut username: Option<String> = None;
    let mut shard_id: Option<String> = None;
    loop {
        let f = r.read_field_begin()?;
        if f.ty == ThriftType::Stop {
            break;
        }
        match (f.id, f.ty) {
            (1, ThriftType::I32) => id = Some(r.read_i32()?),
            (2, ThriftType::String) => username = Some(r.read_string()?),
            (12, ThriftType::String) => shard_id = Some(r.read_string()?),
            (_, ty) => r.skip(ty)?,
        }
        r.read_field_end();
    }
    r.read_struct_end();
    Ok(User {
        id: id.ok_or_else(|| EvernoteError::Malformed("User.id missing".into()))?,
        username: username.unwrap_or_default(),
        shard_id: shard_id
            .ok_or_else(|| EvernoteError::Malformed("User.shardId missing".into()))?,
    })
}

fn read_note_metadata(r: &mut BinaryProtocolReader<Bytes>) -> Result<NoteMetadata, EvernoteError> {
    r.read_struct_begin();
    let mut guid: Option<String> = None;
    let mut title: Option<String> = None;
    let mut updated: Option<i64> = None;
    loop {
        let f = r.read_field_begin()?;
        if f.ty == ThriftType::Stop {
            break;
        }
        match (f.id, f.ty) {
            (1, ThriftType::String) => guid = Some(r.read_string()?),
            (2, ThriftType::String) => title = Some(r.read_string()?),
            (6, ThriftType::I64) => updated = Some(r.read_i64()?),
            (_, ty) => r.skip(ty)?,
        }
        r.read_field_end();
    }
    r.read_struct_end();
    Ok(NoteMetadata {
        guid: guid.ok_or_else(|| EvernoteError::Malformed("NoteMetadata.guid missing".into()))?,
        title,
        updated,
    })
}

fn read_notes_metadata_list(
    r: &mut BinaryProtocolReader<Bytes>,
) -> Result<NotesMetadataList, EvernoteError> {
    r.read_struct_begin();
    let mut start_index: i32 = 0;
    let mut total_notes: i32 = 0;
    let mut notes: Vec<NoteMetadata> = Vec::new();
    loop {
        let f = r.read_field_begin()?;
        if f.ty == ThriftType::Stop {
            break;
        }
        match (f.id, f.ty) {
            (1, ThriftType::I32) => start_index = r.read_i32()?,
            (2, ThriftType::I32) => total_notes = r.read_i32()?,
            (3, ThriftType::List) => {
                let (elem, size) = r.read_list_begin()?;
                if elem != ThriftType::Struct {
                    return Err(EvernoteError::Malformed(
                        "notes list elem not struct".into(),
                    ));
                }
                for _ in 0..size {
                    notes.push(read_note_metadata(r)?);
                }
                r.read_list_end();
            }
            (_, ty) => r.skip(ty)?,
        }
        r.read_field_end();
    }
    r.read_struct_end();
    Ok(NotesMetadataList {
        start_index,
        total_notes,
        notes,
    })
}

struct DataStruct {
    body_hash: Option<Vec<u8>>,
    body: Option<Vec<u8>>,
    #[allow(dead_code)]
    size: i32,
}

fn read_data_struct(r: &mut BinaryProtocolReader<Bytes>) -> Result<DataStruct, EvernoteError> {
    // Data: bodyHash:binary=1, size:i32=2, body:binary=3
    r.read_struct_begin();
    let mut body_hash: Option<Vec<u8>> = None;
    let mut size: i32 = 0;
    let mut body: Option<Vec<u8>> = None;
    loop {
        let f = r.read_field_begin()?;
        if f.ty == ThriftType::Stop {
            break;
        }
        match (f.id, f.ty) {
            (1, ThriftType::String) => body_hash = Some(r.read_binary()?),
            (2, ThriftType::I32) => size = r.read_i32()?,
            (3, ThriftType::String) => body = Some(r.read_binary()?),
            (_, ty) => r.skip(ty)?,
        }
        r.read_field_end();
    }
    r.read_struct_end();
    Ok(DataStruct {
        body_hash,
        body,
        size,
    })
}

fn read_resource_attributes_filename(
    r: &mut BinaryProtocolReader<Bytes>,
) -> Result<Option<String>, EvernoteError> {
    r.read_struct_begin();
    let mut file_name: Option<String> = None;
    loop {
        let f = r.read_field_begin()?;
        if f.ty == ThriftType::Stop {
            break;
        }
        // ResourceAttributes.fileName = id 4
        match (f.id, f.ty) {
            (4, ThriftType::String) => file_name = Some(r.read_string()?),
            (_, ty) => r.skip(ty)?,
        }
        r.read_field_end();
    }
    r.read_struct_end();
    Ok(file_name)
}

fn read_resource_struct(r: &mut BinaryProtocolReader<Bytes>) -> Result<Resource, EvernoteError> {
    r.read_struct_begin();
    let mut guid: Option<String> = None;
    let mut mime: Option<String> = None;
    let mut data_hash: Option<Vec<u8>> = None;
    let mut file_name: Option<String> = None;
    loop {
        let f = r.read_field_begin()?;
        if f.ty == ThriftType::Stop {
            break;
        }
        match (f.id, f.ty) {
            (1, ThriftType::String) => guid = Some(r.read_string()?),
            (3, ThriftType::Struct) => {
                let d = read_data_struct(r)?;
                data_hash = d.body_hash;
            }
            (4, ThriftType::String) => mime = Some(r.read_string()?),
            (11, ThriftType::Struct) => file_name = read_resource_attributes_filename(r)?,
            (_, ty) => r.skip(ty)?,
        }
        r.read_field_end();
    }
    r.read_struct_end();
    Ok(Resource {
        guid: guid.ok_or_else(|| EvernoteError::Malformed("Resource.guid missing".into()))?,
        mime: mime.unwrap_or_else(|| "application/octet-stream".to_string()),
        data_hash_hex: data_hash.map(hex::encode),
        file_name,
    })
}

fn read_note(r: &mut BinaryProtocolReader<Bytes>) -> Result<Note, EvernoteError> {
    r.read_struct_begin();
    let mut guid: Option<String> = None;
    let mut title: String = String::new();
    let mut content: String = String::new();
    let mut created: Option<i64> = None;
    let mut updated: Option<i64> = None;
    let mut resources: Vec<Resource> = Vec::new();
    loop {
        let f = r.read_field_begin()?;
        if f.ty == ThriftType::Stop {
            break;
        }
        match (f.id, f.ty) {
            (1, ThriftType::String) => guid = Some(r.read_string()?),
            (2, ThriftType::String) => title = r.read_string()?,
            (3, ThriftType::String) => content = r.read_string()?,
            (6, ThriftType::I64) => created = Some(r.read_i64()?),
            (7, ThriftType::I64) => updated = Some(r.read_i64()?),
            (13, ThriftType::List) => {
                let (elem, size) = r.read_list_begin()?;
                if elem != ThriftType::Struct {
                    return Err(EvernoteError::Malformed(
                        "Note.resources elem not struct".into(),
                    ));
                }
                for _ in 0..size {
                    resources.push(read_resource_struct(r)?);
                }
                r.read_list_end();
            }
            (_, ty) => r.skip(ty)?,
        }
        r.read_field_end();
    }
    r.read_struct_end();
    Ok(Note {
        guid: guid.ok_or_else(|| EvernoteError::Malformed("Note.guid missing".into()))?,
        title,
        content_enml: content,
        created,
        updated,
        resources,
    })
}

fn read_resource_data(r: &mut BinaryProtocolReader<Bytes>) -> Result<ResourceData, EvernoteError> {
    r.read_struct_begin();
    let mut guid: Option<String> = None;
    let mut mime: Option<String> = None;
    let mut bytes: Option<Vec<u8>> = None;
    let mut file_name: Option<String> = None;
    loop {
        let f = r.read_field_begin()?;
        if f.ty == ThriftType::Stop {
            break;
        }
        match (f.id, f.ty) {
            (1, ThriftType::String) => guid = Some(r.read_string()?),
            (3, ThriftType::Struct) => {
                let d = read_data_struct(r)?;
                bytes = d.body;
            }
            (4, ThriftType::String) => mime = Some(r.read_string()?),
            (11, ThriftType::Struct) => file_name = read_resource_attributes_filename(r)?,
            (_, ty) => r.skip(ty)?,
        }
        r.read_field_end();
    }
    r.read_struct_end();
    Ok(ResourceData {
        guid: guid.ok_or_else(|| EvernoteError::Malformed("Resource.guid missing".into()))?,
        mime: mime.unwrap_or_else(|| "application/octet-stream".to_string()),
        bytes: bytes
            .ok_or_else(|| EvernoteError::Malformed("Resource.data.body missing".into()))?,
        file_name,
    })
}

// --- exception readers -----------------------------------------------------

fn read_app_exception(r: &mut BinaryProtocolReader<Bytes>) -> Result<String, EvernoteError> {
    r.read_struct_begin();
    let mut msg = String::new();
    loop {
        let f = r.read_field_begin()?;
        if f.ty == ThriftType::Stop {
            break;
        }
        match (f.id, f.ty) {
            (1, ThriftType::String) => msg = r.read_string()?,
            (_, ty) => r.skip(ty)?,
        }
        r.read_field_end();
    }
    r.read_struct_end();
    Ok(msg)
}

fn read_known_exception(
    r: &mut BinaryProtocolReader<Bytes>,
    f: FieldHeader,
) -> Result<EvernoteError, ProtocolError> {
    // We treat result-struct fields 1..=3 as EDAM exceptions.
    // 1 = EDAMUserException { errorCode:i32=1, parameter:string=2 }
    // 2 = EDAMSystemException { errorCode:i32=1, message:string=2, rateLimitDuration:i32=3 }
    // 3 = EDAMNotFoundException { identifier:string=1, key:string=2 }
    if f.ty != ThriftType::Struct {
        r.skip(f.ty)?;
        return Ok(EvernoteError::Malformed(format!(
            "exception field {} not struct",
            f.id
        )));
    }
    r.read_struct_begin();
    let parsed = match f.id {
        1 => {
            let mut code = 0i32;
            let mut parameter: Option<String> = None;
            loop {
                let g = r.read_field_begin()?;
                if g.ty == ThriftType::Stop {
                    break;
                }
                match (g.id, g.ty) {
                    (1, ThriftType::I32) => code = r.read_i32()?,
                    (2, ThriftType::String) => parameter = Some(r.read_string()?),
                    (_, ty) => r.skip(ty)?,
                }
                r.read_field_end();
            }
            EvernoteError::User {
                code,
                message: parameter,
            }
        }
        2 => {
            let mut code = 0i32;
            let mut message: Option<String> = None;
            let mut rld: Option<i32> = None;
            loop {
                let g = r.read_field_begin()?;
                if g.ty == ThriftType::Stop {
                    break;
                }
                match (g.id, g.ty) {
                    (1, ThriftType::I32) => code = r.read_i32()?,
                    (2, ThriftType::String) => message = Some(r.read_string()?),
                    (3, ThriftType::I32) => rld = Some(r.read_i32()?),
                    (_, ty) => r.skip(ty)?,
                }
                r.read_field_end();
            }
            EvernoteError::System {
                code,
                message,
                rate_limit_duration: rld,
            }
        }
        3 => {
            let mut identifier: Option<String> = None;
            let mut key: Option<String> = None;
            loop {
                let g = r.read_field_begin()?;
                if g.ty == ThriftType::Stop {
                    break;
                }
                match (g.id, g.ty) {
                    (1, ThriftType::String) => identifier = Some(r.read_string()?),
                    (2, ThriftType::String) => key = Some(r.read_string()?),
                    (_, ty) => r.skip(ty)?,
                }
                r.read_field_end();
            }
            EvernoteError::NotFound { identifier, key }
        }
        _ => EvernoteError::Malformed(format!("unknown exception field id {}", f.id)),
    };
    r.read_struct_end();
    Ok(parsed)
}

#[cfg(test)]
pub(crate) fn build_user_reply_bytes(seq: i32, user: &User) -> Bytes {
    let mut w = BinaryProtocolWriter::new();
    w.write_message_begin("getUser", MessageType::Reply, seq);
    w.write_struct_begin();
    // success field id=0, struct
    w.write_field_begin(ThriftType::Struct, 0);
    w.write_struct_begin();
    w.write_field_begin(ThriftType::I32, 1);
    w.write_i32(user.id);
    w.write_field_end();
    w.write_field_begin(ThriftType::String, 2);
    w.write_string(&user.username);
    w.write_field_end();
    w.write_field_begin(ThriftType::String, 12);
    w.write_string(&user.shard_id);
    w.write_field_end();
    w.write_field_stop();
    w.write_struct_end();
    w.write_field_end();
    w.write_field_stop();
    w.write_struct_end();
    w.write_message_end();
    w.into_bytes()
}

#[cfg(test)]
pub(crate) fn build_system_exception_reply(method: &str, rate_limit_duration: i32) -> Bytes {
    let mut w = BinaryProtocolWriter::new();
    w.write_message_begin(method, MessageType::Reply, 1);
    w.write_struct_begin();
    w.write_field_begin(ThriftType::Struct, 2);
    w.write_struct_begin();
    w.write_field_begin(ThriftType::I32, 1);
    w.write_i32(19);
    w.write_field_end();
    w.write_field_begin(ThriftType::String, 2);
    w.write_string("RATE_LIMIT_REACHED");
    w.write_field_end();
    w.write_field_begin(ThriftType::I32, 3);
    w.write_i32(rate_limit_duration);
    w.write_field_end();
    w.write_field_stop();
    w.write_struct_end();
    w.write_field_end();
    w.write_field_stop();
    w.write_struct_end();
    w.write_message_end();
    w.into_bytes()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::rate_limit::TokenBucket;
    use std::sync::Arc;
    use wiremock::matchers::{header, method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    fn limiter() -> Arc<TokenBucket> {
        Arc::new(TokenBucket::new(10, 100.0))
    }

    fn dummy_user() -> User {
        User {
            id: 190107255,
            username: "claude".to_string(),
            shard_id: "s396".to_string(),
        }
    }

    #[tokio::test]
    async fn get_user_decodes_user_struct() {
        let server = MockServer::start().await;
        let bytes = build_user_reply_bytes(42, &dummy_user());
        Mock::given(method("POST"))
            .and(path("/edam/user"))
            .and(header("content-type", "application/x-thrift"))
            .respond_with(
                ResponseTemplate::new(200)
                    .set_body_bytes(bytes.to_vec())
                    .insert_header("content-type", "application/x-thrift"),
            )
            .mount(&server)
            .await;

        let user_url = format!("{}/edam/user", server.uri());
        let note_url = format!("{}/edam/note", server.uri());
        let user_store = HttpTransport::new(user_url);
        let note_store = HttpTransport::new(note_url);
        let client = EvernoteClient::new(note_store, user_store, "tok", limiter());

        let user = client.get_user().await.unwrap();
        assert_eq!(user, dummy_user());
    }

    #[tokio::test]
    async fn get_user_decodes_rate_limit_exception() {
        let server = MockServer::start().await;
        let bytes = build_system_exception_reply("getUser", 17);
        Mock::given(method("POST"))
            .and(path("/edam/user"))
            .respond_with(
                ResponseTemplate::new(200)
                    .set_body_bytes(bytes.to_vec())
                    .insert_header("content-type", "application/x-thrift"),
            )
            .mount(&server)
            .await;

        let user_store = HttpTransport::new(format!("{}/edam/user", server.uri()));
        let note_store = HttpTransport::new(format!("{}/edam/note", server.uri()));
        let client = EvernoteClient::new(note_store, user_store, "tok", limiter());

        let err = client.get_user().await.unwrap_err();
        match err {
            EvernoteError::System {
                rate_limit_duration: Some(17),
                ..
            } => {}
            other => panic!("unexpected error: {other:?}"),
        }
    }
}
