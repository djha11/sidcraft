import { palette } from "../../src/theme";
import { VerifiedName } from "../../src/verified-name";
import { Ionicons } from "@expo/vector-icons";
import type {
  Conversation,
  DirectMessage,
  FeedAuthor,
  LiveCredentials,
  SendDirectMessage,
} from "@pulse/contracts";
import {
  AudioSession,
  isTrackReference,
  LiveKitRoom,
  useLocalParticipant,
  useTracks,
  VideoTrack,
  Track,
} from "../../src/livekit";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as DocumentPicker from "expo-document-picker";
import { readMediaAsBase64 } from "../../src/media-file";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
  useAudioPlayer,
  useAudioPlayerStatus,
} from "expo-audio";
import { Redirect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  PermissionsAndroid,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../../src/api";
import { useAuth } from "../../src/auth";

type Screen = "inbox" | "requests" | "thread" | "new";
export default function Chat() {
  const auth = useAuth();
  const token = auth.accessToken;
  const [screen, setScreen] = useState<Screen>("inbox");
  const [items, setItems] = useState<Conversation[]>([]);
  const [requests, setRequests] = useState<Conversation[]>([]);
  const [active, setActive] = useState<Conversation | null>(null);
  const [composeTo, setComposeTo] = useState<FeedAuthor | null>(null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [people, setPeople] = useState<FeedAuthor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [recordingStartedAt, setRecordingStartedAt] = useState<number | null>(
    null,
  );
  const [recordingElapsed, setRecordingElapsed] = useState(0);
  const [call, setCall] = useState<{
    credentials: LiveCredentials;
    kind: "voice" | "video";
  } | null>(null);
  const [callLoading, setCallLoading] = useState<"voice" | "video" | null>(
    null,
  );
  const [camera, setCamera] = useState<CameraView | null>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 250);
  useEffect(() => {
    if (!isRecordingVoice || !recordingStartedAt) return;
    const update = () => setRecordingElapsed(Date.now() - recordingStartedAt);
    update();
    const timer = setInterval(update, 250);
    return () => clearInterval(timer);
  }, [isRecordingVoice, recordingStartedAt]);
  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const [normal, pending] = await Promise.all([
        api.conversations(false, token),
        api.conversations(true, token),
      ]);
      setItems(normal.items);
      setRequests(pending.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "CHAT_LOAD_FAILED");
    } finally {
      setLoading(false);
    }
  }, [token]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!token || screen !== "new") return;
    const timer = setTimeout(
      () =>
        void api
          .chatUsers(query, token)
          .then((r) => setPeople(r.items))
          .catch(() => setPeople([])),
      250,
    );
    return () => clearTimeout(timer);
  }, [query, screen, token]);
  const open = async (conversation: Conversation) => {
    if (!token) return;
    setActive(conversation);
    setScreen("thread");
    setLoading(true);
    try {
      setMessages((await api.directMessages(conversation.id, token)).items);
    } finally {
      setLoading(false);
    }
  };
  const send = async (attachment?: SendDirectMessage["attachment"]) => {
    if (
      !token ||
      (!active && !composeTo) ||
      (!draft.trim() && !attachment) ||
      active?.isIncomingRequest
    )
      return;
    const body = draft.trim();
    setDraft("");
    try {
      const sent = active
        ? await api.sendConversationMessage(
            active.id,
            { body, attachment },
            token,
          )
        : await api.sendDirectMessage(
            composeTo!.id,
            { body, attachment },
            token,
          );
      setMessages((old) => [...old, sent]);
      if (!active) {
        const normal = await api.conversations(false, token);
        setActive(
          normal.items.find((item) => item.id === sent.conversationId) ?? null,
        );
        setComposeTo(null);
      }
      void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "MESSAGE_SEND_FAILED");
    }
  };
  const fileAttachment = async (
    uri: string,
    name: string,
    mimeType: string,
    size?: number | null,
  ): Promise<NonNullable<SendDirectMessage["attachment"]>> => ({
    kind: mimeType.startsWith("image/")
      ? "image"
      : mimeType.startsWith("video/")
        ? "video"
        : mimeType.startsWith("audio/")
          ? "audio"
          : "file",
    mimeType,
    originalName: name,
    sizeBytes: size ?? 1,
    base64: await readMediaAsBase64(uri),
  });
  const pickMedia = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ["image/*", "video/*", "audio/*", "application/pdf"],
      copyToCacheDirectory: true,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset) return;
    await send(
      await fileAttachment(
        asset.uri,
        asset.name,
        asset.mimeType ?? "application/octet-stream",
        asset.size,
      ),
    );
  };
  const openCamera = async () => {
    const permission = cameraPermission?.granted
      ? cameraPermission
      : await requestCameraPermission();
    if (!permission.granted)
      return Alert.alert(
        "Camera permission",
        "Allow camera access to take a photo for this chat.",
      );
    setCameraOpen(true);
  };
  const capturePhoto = async () => {
    const photo = await camera?.takePictureAsync({ quality: 0.8 });
    if (!photo) return;
    setCameraOpen(false);
    await send(
      await fileAttachment(photo.uri, `chat-${Date.now()}.jpg`, "image/jpeg"),
    );
  };
  const toggleRecording = async () => {
    if (voiceBusy) return;
    setVoiceBusy(true);
    try {
      if (isRecordingVoice) {
        await recorder.stop();
        const uri = recorder.uri;
        setIsRecordingVoice(false);
        setRecordingStartedAt(null);
        setRecordingElapsed(0);
        if (Platform.OS === "ios")
          await setAudioModeAsync({ allowsRecording: false });
        if (!uri) throw new Error("The recording file was not created.");
        await send(
          await fileAttachment(uri, `voice-${Date.now()}.m4a`, "audio/mp4"),
        );
        return;
      }
      const microphoneGranted =
        Platform.OS === "android"
          ? (await PermissionsAndroid.check(
              PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
            )) ||
            (await PermissionsAndroid.request(
              PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
            )) === PermissionsAndroid.RESULTS.GRANTED
          : (await requestRecordingPermissionsAsync()).granted;
      if (!microphoneGranted)
        return Alert.alert(
          "Microphone permission",
          "Allow microphone access to record voice messages.",
        );
      if (Platform.OS === "ios")
        await setAudioModeAsync({
          allowsRecording: true,
          playsInSilentMode: true,
          interruptionMode: "doNotMix",
        });
      if (!recorderState.canRecord) {
        try {
          await recorder.prepareToRecordAsync();
        } catch (prepareError) {
          if (
            !(prepareError instanceof Error) ||
            !prepareError.message.includes("already been prepared")
          )
            throw prepareError;
        }
      }
      recorder.record();
      setRecordingStartedAt(Date.now());
      setRecordingElapsed(0);
      setIsRecordingVoice(true);
    } catch (e) {
      setIsRecordingVoice(false);
      setRecordingStartedAt(null);
      setRecordingElapsed(0);
      if (Platform.OS === "ios")
        await setAudioModeAsync({ allowsRecording: false }).catch(() => {});
      Alert.alert(
        "Voice message failed",
        e instanceof Error ? e.message : "Could not use the microphone.",
      );
    } finally {
      setVoiceBusy(false);
    }
  };
  const startCall = async (kind: "voice" | "video") => {
    if (!token || !active) {
      return Alert.alert(
        "Send a message first",
        "Start the conversation before placing a call.",
      );
    }
    if (active.status !== "accepted") {
      return Alert.alert(
        "Message request pending",
        `${active.otherUser.displayName} needs to accept your message request before you can call.`,
      );
    }
    setCallLoading(kind);
    try {
      setCall({
        credentials: await api.callCredentials(active.id, token),
        kind,
      });
    } catch (e) {
      Alert.alert(
        "Call could not start",
        e instanceof Error ? e.message : "Please try again.",
      );
    } finally {
      setCallLoading(null);
    }
  };
  const start = async (person: FeedAuthor) => {
    setComposeTo(person);
    setActive(null);
    setMessages([]);
    setScreen("thread");
  };
  const accept = async () => {
    if (!token || !active) return;
    await api.acceptMessageRequest(active.id, token);
    setActive({ ...active, status: "accepted", isIncomingRequest: false });
    await load();
  };
  const decline = async () => {
    if (!token || !active) return;
    await api.declineMessageRequest(active.id, token);
    setActive(null);
    setScreen("requests");
    await load();
  };
  if (!auth.loading && !token) return <Redirect href="/login" />;
  const title =
    screen === "requests"
      ? "Message requests"
      : screen === "new"
        ? "New message"
        : screen === "thread"
          ? (active?.otherUser.displayName ?? composeTo?.displayName ?? "Chat")
          : "Messages";
  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      <KeyboardAvoidingView
        style={s.safe}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={[s.header, screen === "thread" && s.threadHeader]}>
          {screen !== "inbox" ? (
            <Pressable
              accessibilityLabel="Back"
              onPress={() => {
                setScreen(
                  screen === "thread" && active?.isIncomingRequest
                    ? "requests"
                    : "inbox",
                );
                setActive(null);
                setComposeTo(null);
              }}
            >
              <Ionicons name="chevron-back" size={28} color={palette.text} />
            </Pressable>
          ) : (
            <Text style={s.brand}>● SidCraft</Text>
          )}
          {screen === "thread" && (active || composeTo) ? (
            <View style={s.threadIdentity}>
              <Avatar user={(active?.otherUser ?? composeTo)!} size={40} />
              <View style={s.threadNames}>
                <VerifiedName
                  name={title}
                  type={(active?.otherUser ?? composeTo)?.verificationType}
                  textStyle={s.threadName}
                  numberOfLines={1}
                />
                <Text numberOfLines={1} style={s.threadHandle}>
                  @{(active?.otherUser ?? composeTo)!.handle}
                </Text>
              </View>
            </View>
          ) : (
            <Text numberOfLines={1} style={s.title}>
              {title}
            </Text>
          )}
          {screen === "thread" ? (
            <View style={s.callActions}>
              <Pressable
                accessibilityLabel="Voice call"
                style={s.callButton}
                disabled={!!callLoading}
                onPress={() => void startCall("voice")}
              >
                {callLoading === "voice" ? (
                  <ActivityIndicator size="small" color={palette.accent} />
                ) : (
                  <Ionicons
                    name="call-outline"
                    size={22}
                    color={palette.text}
                  />
                )}
              </Pressable>
              <Pressable
                accessibilityLabel="Video call"
                style={s.callButton}
                disabled={!!callLoading}
                onPress={() => void startCall("video")}
              >
                {callLoading === "video" ? (
                  <ActivityIndicator size="small" color={palette.accent} />
                ) : (
                  <Ionicons
                    name="videocam-outline"
                    size={24}
                    color={palette.text}
                  />
                )}
              </Pressable>
            </View>
          ) : screen === "inbox" ? (
            <Pressable
              accessibilityLabel="New message"
              onPress={() => setScreen("new")}
            >
              <Ionicons name="create-outline" size={25} color={palette.text} />
            </Pressable>
          ) : (
            <View style={s.stub} />
          )}
        </View>
        {screen === "inbox" && (
          <>
            <View style={s.search}>
              <Ionicons name="search" size={18} color={palette.muted} />
              <TextInput
                placeholder="Search messages"
                placeholderTextColor={palette.muted}
                style={s.searchInput}
              />
            </View>
            <Pressable
              style={s.requestRow}
              onPress={() => setScreen("requests")}
            >
              <View style={s.requestIcon}>
                <Ionicons
                  name="mail-unread-outline"
                  size={22}
                  color={palette.accent}
                />
              </View>
              <Text style={s.requestText}>Requests</Text>
              {requests.length > 0 && (
                <Text style={s.badge}>{requests.length}</Text>
              )}
              <Ionicons
                name="chevron-forward"
                size={20}
                color={palette.muted}
              />
            </Pressable>
          </>
        )}
        {screen === "new" && (
          <>
            <View style={s.toRow}>
              <Text style={s.to}>To:</Text>
              <TextInput
                autoFocus
                value={query}
                onChangeText={setQuery}
                placeholder="Search people"
                placeholderTextColor={palette.muted}
                style={s.toInput}
              />
            </View>
            <FlatList
              data={people}
              keyExtractor={(x) => x.id}
              renderItem={({ item }) => (
                <Person person={item} onPress={() => void start(item)} />
              )}
            />
          </>
        )}
        {(screen === "inbox" || screen === "requests") &&
          (loading && !(screen === "inbox" ? items : requests).length ? (
            <ActivityIndicator color={palette.accent} style={s.loader} />
          ) : (
            <FlatList
              data={screen === "inbox" ? items : requests}
              keyExtractor={(x) => x.id}
              refreshControl={
                <RefreshControl
                  refreshing={loading}
                  onRefresh={() => void load()}
                  tintColor={palette.accent}
                />
              }
              contentContainerStyle={s.list}
              renderItem={({ item }) => (
                <ConversationRow item={item} onPress={() => void open(item)} />
              )}
              ListEmptyComponent={
                <View style={s.empty}>
                  <Ionicons
                    name={
                      screen === "requests"
                        ? "shield-checkmark-outline"
                        : "chatbubble-ellipses-outline"
                    }
                    size={52}
                    color={palette.borderSoft}
                  />
                  <Text style={s.emptyTitle}>
                    {screen === "requests"
                      ? "No message requests"
                      : "Start a conversation"}
                  </Text>
                  <Text style={s.emptyCopy}>
                    {screen === "requests"
                      ? "Messages from people you don’t follow appear here."
                      : "Messages and story replies will appear here."}
                  </Text>
                </View>
              }
            />
          ))}
        {screen === "thread" && (active || composeTo) && (
          <>
            <FlatList
              data={messages}
              keyExtractor={(x) => x.id}
              contentContainerStyle={s.thread}
              renderItem={({ item }) => (
                <View style={[s.bubble, item.isOwn ? s.mine : s.theirs]}>
                  {item.attachment && (
                    <MessageAttachment message={item} token={token!} />
                  )}
                  {!!item.body && <Text style={s.body}>{item.body}</Text>}
                  <Text style={s.time}>
                    {new Date(item.createdAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </Text>
                </View>
              )}
              ListHeaderComponent={
                active?.isIncomingRequest ? (
                  <View style={s.requestIntro}>
                    <Avatar user={active.otherUser} size={72} />
                    <VerifiedName
                      name={active.otherUser.displayName}
                      type={active.otherUser.verificationType}
                      textStyle={s.introName}
                    />
                    <Text style={s.introHandle}>
                      @{active.otherUser.handle}
                    </Text>
                    <Text style={s.introCopy}>
                      Accept this request to let them know you’ve seen it and
                      allow future messages.
                    </Text>
                  </View>
                ) : null
              }
            />
            {active?.isIncomingRequest ? (
              <View style={s.actions}>
                <Pressable
                  style={s.deleteButton}
                  onPress={() => void decline()}
                >
                  <Text style={s.deleteText}>Delete</Text>
                </Pressable>
                <Pressable style={s.acceptButton} onPress={() => void accept()}>
                  <Text style={s.acceptText}>Accept</Text>
                </Pressable>
              </View>
            ) : (
              <View>
                {(isRecordingVoice || voiceBusy) && (
                  <View style={s.recordingBar}>
                    <View style={s.recordingDot} />
                    <Text style={s.recordingText}>
                      {isRecordingVoice
                        ? `Recording ${formatDuration(recordingElapsed)}`
                        : "Starting microphone…"}
                    </Text>
                    <Text style={s.recordingHint}>Tap stop to send</Text>
                  </View>
                )}
                <View style={s.composer}>
                  <Pressable
                    accessibilityLabel="Camera"
                    style={s.cameraButton}
                    onPress={() => void openCamera()}
                  >
                    <Ionicons
                      name="camera"
                      size={22}
                      color={palette.onAccent}
                    />
                  </Pressable>
                  <TextInput
                    value={draft}
                    onChangeText={setDraft}
                    placeholder="Message…"
                    placeholderTextColor={palette.muted}
                    style={s.input}
                    multiline
                  />
                  <Pressable
                    accessibilityLabel={
                      isRecordingVoice
                        ? "Stop voice recording"
                        : "Record voice message"
                    }
                    hitSlop={10}
                    style={[s.composerIcon, isRecordingVoice && s.recording]}
                    disabled={voiceBusy}
                    onPressIn={() => void toggleRecording()}
                  >
                    <Ionicons
                      name={isRecordingVoice ? "stop-circle" : "mic-outline"}
                      size={23}
                      color={isRecordingVoice ? "#ff625c" : palette.text}
                    />
                  </Pressable>
                  <Pressable
                    accessibilityLabel="Choose media"
                    style={s.composerIcon}
                    onPress={() => void pickMedia()}
                  >
                    <Ionicons
                      name="images-outline"
                      size={23}
                      color={palette.text}
                    />
                  </Pressable>
                  <Pressable
                    accessibilityLabel="Send"
                    disabled={!draft.trim()}
                    onPress={() => void send()}
                  >
                    <Ionicons
                      name="send"
                      size={25}
                      color={draft.trim() ? palette.accent : palette.muted}
                    />
                  </Pressable>
                </View>
              </View>
            )}
          </>
        )}
        {!!error && <Text style={s.error}>{error}</Text>}
        <Modal
          visible={cameraOpen}
          animationType="slide"
          onRequestClose={() => setCameraOpen(false)}
        >
          <View style={s.cameraScreen}>
            <CameraView
              ref={setCamera}
              style={StyleSheet.absoluteFill}
              facing="back"
            />
            <SafeAreaView style={s.cameraControls}>
              <Pressable
                accessibilityLabel="Close camera"
                onPress={() => setCameraOpen(false)}
              >
                <Ionicons name="close" size={32} color={palette.text} />
              </Pressable>
              <Pressable
                accessibilityLabel="Take photo"
                style={s.shutter}
                onPress={() => void capturePhoto()}
              >
                <View style={s.shutterInner} />
              </Pressable>
              <View style={s.cameraSpacer} />
            </SafeAreaView>
          </View>
        </Modal>
        <Modal
          visible={!!call}
          animationType="slide"
          onRequestClose={() => setCall(null)}
        >
          {call && (
            <CallRoom
              credentials={call.credentials}
              kind={call.kind}
              person={(active?.otherUser ?? composeTo)!}
              onEnd={() => setCall(null)}
            />
          )}
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
function formatDuration(milliseconds: number) {
  const seconds = Math.floor(milliseconds / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
function CallRoom({
  credentials,
  kind,
  person,
  onEnd,
}: {
  credentials: LiveCredentials;
  kind: "voice" | "video";
  person: FeedAuthor;
  onEnd: () => void;
}) {
  useEffect(() => {
    void AudioSession.startAudioSession();
    return () => void AudioSession.stopAudioSession();
  }, []);
  return (
    <LiveKitRoom
      serverUrl={credentials.serverUrl}
      token={credentials.token}
      connect
      audio
      video={kind === "video"}
      options={{ adaptiveStream: true, dynacast: true }}
    >
      <CallSurface kind={kind} person={person} onEnd={onEnd} />
    </LiveKitRoom>
  );
}
function CallSurface({
  kind,
  person,
  onEnd,
}: {
  kind: "voice" | "video";
  person: FeedAuthor;
  onEnd: () => void;
}) {
  const tracks = useTracks([Track.Source.Camera], { onlySubscribed: false });
  const remote = tracks.find(
    (track) => isTrackReference(track) && !track.participant.isLocal,
  );
  const local = tracks.find(
    (track) => isTrackReference(track) && track.participant.isLocal,
  );
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled } =
    useLocalParticipant();
  return (
    <SafeAreaView style={s.callScreen}>
      {kind === "video" && remote && isTrackReference(remote) ? (
        <VideoTrack trackRef={remote} style={s.remoteVideo} />
      ) : (
        <View style={s.callPerson}>
          <Avatar user={person} size={112} />
          <VerifiedName
            name={person.displayName}
            type={person.verificationType}
            size={22}
            textStyle={s.callName}
          />
          <Text style={s.callStatus}>
            Private {kind} call · waiting to connect
          </Text>
        </View>
      )}
      {kind === "video" && local && isTrackReference(local) && (
        <VideoTrack trackRef={local} style={s.localVideo} />
      )}
      <View style={s.callControls}>
        <Pressable
          accessibilityLabel={isMicrophoneEnabled ? "Mute" : "Unmute"}
          style={s.mediaControl}
          onPress={() =>
            void localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled)
          }
        >
          <Ionicons
            name={isMicrophoneEnabled ? "mic" : "mic-off"}
            size={26}
            color={palette.text}
          />
        </Pressable>
        {kind === "video" && (
          <Pressable
            accessibilityLabel={
              isCameraEnabled ? "Turn camera off" : "Turn camera on"
            }
            style={s.mediaControl}
            onPress={() =>
              void localParticipant.setCameraEnabled(!isCameraEnabled)
            }
          >
            <Ionicons
              name={isCameraEnabled ? "videocam" : "videocam-off"}
              size={28}
              color={palette.text}
            />
          </Pressable>
        )}
        <Pressable
          accessibilityLabel="End call"
          style={s.endCall}
          onPress={onEnd}
        >
          <Ionicons name="call" size={27} color={palette.text} />
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
function MessageAttachment({
  message,
  token,
}: {
  message: DirectMessage;
  token: string;
}) {
  const attachment = message.attachment;
  if (!attachment) return null;
  const source = {
    uri: api.mediaUrl(attachment.url),
    headers: { authorization: `Bearer ${token}` },
  };
  const player = useAudioPlayer(attachment.kind === "audio" ? source : null, {
    updateInterval: 250,
  });
  const playerStatus = useAudioPlayerStatus(player);
  if (attachment.kind === "image")
    return <Image source={source} style={s.messageImage} resizeMode="cover" />;
  const icon =
    attachment.kind === "video"
      ? "videocam"
      : attachment.kind === "audio"
        ? "mic"
        : "document-text";
  return (
    <Pressable
      style={s.attachmentCard}
      disabled={attachment.kind !== "audio"}
      onPress={() => {
        if (playerStatus.playing) player.pause();
        else {
          if (playerStatus.didJustFinish) player.seekTo(0);
          player.play();
        }
      }}
    >
      <View style={s.attachmentIcon}>
        <Ionicons name={icon} size={22} color={palette.accent} />
      </View>
      <View style={s.attachmentCopy}>
        <Text numberOfLines={1} style={s.attachmentName}>
          {attachment.kind === "audio"
            ? "Voice message"
            : attachment.originalName}
        </Text>
        <Text style={s.attachmentMeta}>
          {Math.max(1, Math.round(attachment.sizeBytes / 1024))} KB
        </Text>
      </View>
      <Ionicons
        name={playerStatus.playing ? "pause-circle" : "play-circle-outline"}
        size={25}
        color={palette.text}
      />
    </Pressable>
  );
}
function Avatar({ user, size = 56 }: { user: FeedAuthor; size?: number }) {
  return (
    <View
      style={[s.avatar, { width: size, height: size, borderRadius: size / 2 }]}
    >
      <Text style={s.avatarFallback}>{user.displayName[0]?.toUpperCase()}</Text>
      <Image
        source={{ uri: api.mediaUrl(`/v1/feed/users/${user.id}/avatar`) }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
      />
    </View>
  );
}
function Person({
  person,
  onPress,
}: {
  person: FeedAuthor;
  onPress: () => void;
}) {
  return (
    <Pressable style={s.person} onPress={onPress}>
      <Avatar user={person} />
      <View>
        <VerifiedName
          name={person.displayName}
          type={person.verificationType}
          textStyle={s.name}
        />
        <Text style={s.handle}>@{person.handle}</Text>
      </View>
    </Pressable>
  );
}
function ConversationRow({
  item,
  onPress,
}: {
  item: Conversation;
  onPress: () => void;
}) {
  return (
    <Pressable style={s.person} onPress={onPress}>
      <Avatar user={item.otherUser} />
      <View style={s.rowBody}>
        <VerifiedName
          name={item.otherUser.displayName}
          type={item.otherUser.verificationType}
          textStyle={s.name}
        />
        <Text
          numberOfLines={1}
          style={[s.preview, item.unreadCount > 0 && s.unread]}
        >
          {item.lastMessage?.isOwn ? "You: " : ""}
          {item.lastMessage?.body ?? "New conversation"}
        </Text>
      </View>
      <View style={s.rowMeta}>
        <Text style={s.date}>
          {new Date(item.updatedAt).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          })}
        </Text>
        {item.unreadCount > 0 && <View style={s.dot} />}
      </View>
    </Pressable>
  );
}
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.background },
  header: {
    height: 58,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.borderSoft,
  },
  threadHeader: { height: 66, paddingHorizontal: 12, gap: 9 },
  threadIdentity: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  threadNames: { flex: 1 },
  threadName: { color: palette.text, fontWeight: "900", fontSize: 15 },
  threadHandle: { color: palette.muted, fontSize: 11, marginTop: 2 },
  callActions: { flexDirection: "row", gap: 5 },
  callButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  brand: { color: palette.text, fontSize: 20, fontWeight: "900" },
  title: {
    color: palette.text,
    fontWeight: "900",
    fontSize: 18,
    maxWidth: "65%",
  },
  stub: { width: 28 },
  search: {
    margin: 12,
    height: 42,
    borderRadius: 14,
    backgroundColor: palette.surface,
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
  },
  searchInput: { flex: 1, color: palette.text, paddingHorizontal: 9 },
  requestRow: {
    height: 66,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#202533",
  },
  requestIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: palette.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  requestText: {
    color: palette.text,
    fontWeight: "800",
    fontSize: 15,
    flex: 1,
  },
  badge: {
    backgroundColor: palette.accent,
    color: palette.onAccent,
    fontWeight: "900",
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    textAlign: "center",
    lineHeight: 22,
  },
  list: { flexGrow: 1, paddingVertical: 6 },
  person: {
    minHeight: 74,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
  },
  avatar: {
    backgroundColor: palette.surface,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarFallback: {
    position: "absolute",
    color: palette.accent,
    fontWeight: "900",
  },
  name: { color: palette.text, fontWeight: "800", fontSize: 15 },
  handle: { color: palette.muted, fontSize: 13, marginTop: 3 },
  rowBody: { flex: 1 },
  preview: { color: palette.muted, fontSize: 13, marginTop: 4 },
  unread: { color: palette.text, fontWeight: "700" },
  rowMeta: { alignItems: "flex-end", gap: 8 },
  date: { color: palette.muted, fontSize: 11 },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: palette.accent,
  },
  empty: { alignItems: "center", paddingHorizontal: 40, marginTop: 110 },
  emptyTitle: {
    color: palette.text,
    fontWeight: "900",
    fontSize: 20,
    marginTop: 18,
  },
  emptyCopy: {
    color: palette.muted,
    textAlign: "center",
    lineHeight: 20,
    marginTop: 8,
  },
  loader: { marginTop: 60 },
  toRow: {
    height: 54,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#202533",
  },
  to: { color: palette.text, fontWeight: "800" },
  toInput: { flex: 1, color: palette.text, paddingHorizontal: 12 },
  thread: { padding: 14, gap: 8, flexGrow: 1, justifyContent: "flex-end" },
  bubble: {
    maxWidth: "78%",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
  },
  messageImage: { width: 210, height: 230, borderRadius: 14, marginBottom: 6 },
  attachmentCard: {
    width: 220,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingVertical: 4,
  },
  attachmentIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: palette.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  attachmentCopy: { flex: 1 },
  attachmentName: { color: palette.text, fontWeight: "800", fontSize: 12 },
  attachmentMeta: { color: palette.muted, fontSize: 10, marginTop: 2 },
  mine: {
    backgroundColor: palette.accentSoft,
    borderWidth: 1,
    borderColor: palette.accent,
    alignSelf: "flex-end",
    borderBottomRightRadius: 5,
  },
  theirs: {
    backgroundColor: palette.surface,
    alignSelf: "flex-start",
    borderBottomLeftRadius: 5,
  },
  body: { color: palette.text, fontSize: 15, lineHeight: 20 },
  time: {
    color: palette.muted,
    fontSize: 9,
    alignSelf: "flex-end",
    marginTop: 4,
  },
  composer: {
    margin: 10,
    minHeight: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: palette.borderSoft,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
    gap: 8,
  },
  cameraButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: palette.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  recording: { transform: [{ scale: 1.12 }] },
  composerIcon: {
    width: 36,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  recordingBar: {
    marginHorizontal: 20,
    paddingTop: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#ff625c",
  },
  recordingText: { color: "#ff827c", fontWeight: "800", fontSize: 12 },
  recordingHint: { color: palette.muted, fontSize: 11, marginLeft: "auto" },
  input: { flex: 1, color: palette.text, maxHeight: 110 },
  requestIntro: { alignItems: "center", padding: 22 },
  introName: {
    color: palette.text,
    fontWeight: "900",
    fontSize: 20,
    marginTop: 12,
  },
  introHandle: { color: palette.muted, marginTop: 3 },
  introCopy: {
    color: palette.muted,
    textAlign: "center",
    lineHeight: 20,
    marginTop: 16,
  },
  actions: { flexDirection: "row", gap: 10, padding: 12 },
  deleteButton: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.borderSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  deleteText: { color: "#ff776d", fontWeight: "900" },
  acceptButton: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    backgroundColor: palette.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  acceptText: { color: palette.onAccent, fontWeight: "900" },
  error: { color: "#ff766d", textAlign: "center", padding: 6, fontSize: 12 },
  cameraScreen: { flex: 1, backgroundColor: "#000" },
  cameraControls: {
    flex: 1,
    padding: 22,
    justifyContent: "space-between",
    alignItems: "center",
    flexDirection: "row",
  },
  shutter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: palette.border,
    padding: 5,
    alignSelf: "flex-end",
  },
  shutterInner: {
    flex: 1,
    borderRadius: 32,
    backgroundColor: palette.surfaceStrong,
  },
  cameraSpacer: { width: 32 },
  callScreen: { flex: 1, backgroundColor: palette.background },
  remoteVideo: { position: "absolute", inset: 0 },
  callPerson: { flex: 1, alignItems: "center", justifyContent: "center" },
  callName: {
    color: palette.text,
    fontSize: 27,
    fontWeight: "900",
    marginTop: 20,
  },
  callStatus: { color: palette.muted, fontSize: 14, marginTop: 8 },
  localVideo: {
    position: "absolute",
    right: 18,
    top: 70,
    width: 112,
    height: 168,
    borderRadius: 18,
    overflow: "hidden",
  },
  callControls: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 42,
    flexDirection: "row",
    justifyContent: "center",
    gap: 18,
  },
  mediaControl: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "rgba(54,61,72,0.92)",
    alignItems: "center",
    justifyContent: "center",
  },
  endCall: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "#ef3d4d",
    alignItems: "center",
    justifyContent: "center",
    transform: [{ rotate: "135deg" }],
  },
});
