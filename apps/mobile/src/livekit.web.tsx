import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PropsWithChildren,
} from "react";
import {
  Room,
  RoomEvent,
  Track,
  type LocalParticipant,
  type Participant,
  type TrackPublication,
} from "livekit-client";

type WebParticipant = Participant & { isLocal: boolean };

export type TrackReference = {
  participant: WebParticipant;
  publication: TrackPublication;
};

type LiveKitContextValue = {
  localParticipant: LocalParticipant | null;
  tracks: TrackReference[];
};

const LiveKitContext = createContext<LiveKitContextValue>({
  localParticipant: null,
  tracks: [],
});

function browserServerUrl(serverUrl: string) {
  if (typeof window === "undefined") return serverUrl;

  try {
    const url = new URL(serverUrl);
    if (url.hostname === "10.0.2.2") {
      url.hostname = window.location.hostname || "localhost";
    }
    return url.toString();
  } catch {
    return serverUrl;
  }
}

function roomTracks(room: Room): TrackReference[] {
  const participants: Participant[] = [
    room.localParticipant,
    ...room.remoteParticipants.values(),
  ];

  return participants.flatMap((participant) =>
    [...participant.trackPublications.values()].map((publication) => ({
      participant: Object.assign(participant, {
        isLocal: participant === room.localParticipant,
      }) as WebParticipant,
      publication,
    })),
  );
}

export function LiveKitRoom({
  serverUrl,
  token,
  connect,
  audio,
  video,
  children,
}: PropsWithChildren<{
  serverUrl: string;
  token: string;
  connect: boolean;
  audio?: boolean;
  video?: boolean;
}>) {
  const room = useMemo(
    () => new Room({ adaptiveStream: true, dynacast: true }),
    [],
  );
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    const events = [
      RoomEvent.Connected,
      RoomEvent.Disconnected,
      RoomEvent.ParticipantConnected,
      RoomEvent.ParticipantDisconnected,
      RoomEvent.TrackPublished,
      RoomEvent.TrackUnpublished,
      RoomEvent.TrackSubscribed,
      RoomEvent.TrackUnsubscribed,
      RoomEvent.LocalTrackPublished,
      RoomEvent.LocalTrackUnpublished,
    ];
    events.forEach((event) => room.on(event, refresh));

    return () => {
      events.forEach((event) => room.off(event, refresh));
    };
  }, [refresh, room]);

  useEffect(() => {
    let cancelled = false;

    async function synchronizeRoom() {
      if (!connect) {
        await room.disconnect();
        return;
      }

      try {
        if (room.state === "disconnected") {
          await room.connect(browserServerUrl(serverUrl), token);
        }
        if (cancelled) return;
        await room.localParticipant.setMicrophoneEnabled(Boolean(audio));
        await room.localParticipant.setCameraEnabled(Boolean(video));
        refresh();
      } catch (error) {
        console.error("Unable to connect live room", error);
        refresh();
      }
    }

    void synchronizeRoom();
    return () => {
      cancelled = true;
      void room.disconnect();
    };
  }, [audio, connect, refresh, room, serverUrl, token, video]);

  const value = useMemo<LiveKitContextValue>(
    () => ({
      localParticipant: room.localParticipant,
      tracks: roomTracks(room),
    }),
    [revision, room],
  );

  return (
    <LiveKitContext.Provider value={value}>
      {children}
    </LiveKitContext.Provider>
  );
}

export function VideoTrack({
  trackRef,
  style,
}: {
  trackRef: TrackReference;
  style?: Record<string, unknown>;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const track = trackRef.publication.track;

  useEffect(() => {
    const element = videoRef.current;
    if (!element || !track) return;
    track.attach(element);
    void element.play().catch(() => undefined);
    return () => {
      track.detach(element);
    };
  }, [track]);

  return createElement("video", {
    ref: videoRef,
    autoPlay: true,
    muted: trackRef.participant.isLocal,
    playsInline: true,
    style: {
      width: "100%",
      height: "100%",
      objectFit: "cover",
      ...(style as CSSProperties),
    },
  });
}

export function isTrackReference(value: unknown): value is TrackReference {
  return Boolean(
    value &&
      typeof value === "object" &&
      "participant" in value &&
      "publication" in value,
  );
}

export function useTracks(
  _sources?: unknown,
  _options?: { onlySubscribed?: boolean },
) {
  return useContext(LiveKitContext).tracks;
}

export function useLocalParticipant() {
  const { localParticipant } = useContext(LiveKitContext);
  return {
    localParticipant,
    isMicrophoneEnabled: localParticipant?.isMicrophoneEnabled ?? false,
    isCameraEnabled: localParticipant?.isCameraEnabled ?? false,
  };
}

export function registerGlobals() {}

export const AudioSession = {
  startAudioSession: async () => undefined,
  stopAudioSession: async () => undefined,
};

export { Track };
