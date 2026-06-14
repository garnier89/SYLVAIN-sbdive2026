import React, { useRef } from 'react';
import { JitsiMeeting } from '@jitsi/react-sdk';

// Embedded 1-on-1 Jitsi video consultation (free public meet.jit.si server).
// roomName + displayName are provided by the backend at join time.
export const VideoCall = ({ roomName, displayName, providerName, onClose }) => {
  const apiRef = useRef(null);

  return (
    <div className="fixed inset-0 z-[60] bg-gray-900 flex flex-col" data-testid="video-call-room">
      <div className="flex items-center justify-between px-4 py-3 bg-gray-900 text-white border-b border-white/10">
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">Consultation en cours</p>
          <p className="text-xs text-white/60 truncate">{providerName}</p>
        </div>
        <button
          onClick={onClose}
          className="bg-red-500 hover:bg-red-600 text-white text-xs font-semibold px-4 py-2 rounded-full transition-colors"
          data-testid="video-call-leave"
        >
          Quitter
        </button>
      </div>
      <div className="flex-1 min-h-0" data-testid="video-call-frame">
        <JitsiMeeting
          roomName={roomName}
          userInfo={{ displayName: displayName || 'Patient' }}
          configOverwrite={{
            startWithAudioMuted: false,
            startWithVideoMuted: false,
            prejoinPageEnabled: false,
            disableModeratorIndicator: true,
            disableThirdPartyRequests: true,
          }}
          interfaceConfigOverwrite={{
            MOBILE_APP_PROMO: false,
            SHOW_JITSI_WATERMARK: false,
            SHOW_CHROME_EXTENSION_BANNER: false,
          }}
          onApiReady={(externalApi) => { apiRef.current = externalApi; }}
          onReadyToClose={() => { if (onClose) onClose(); }}
          getIFrameRef={(node) => {
            node.style.height = '100%';
            node.style.width = '100%';
          }}
        />
      </div>
    </div>
  );
};

export default VideoCall;
