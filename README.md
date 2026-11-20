# Recordance

A small, local-first iPhone camera app for recording while listening to your own audio through headphones. Preview the take, move the music earlier or later **relative to the recorded performance**, and export a video with that adjustment. Changing the slider while the preview plays changes the alignment immediately. The last slider position stays in place for subsequent takes while the page is open.

This is an early prototype. It has not yet been validated on every iPhone or iOS version. Audio, video and exporting remain on the device; the server only serves the app files. Song files must be accessible through the iPhone's Files picker; streaming-service offline downloads are generally not importable. A take and its song are held in memory, so leaving/reloading the page loses the take.

## Run on your computer

Requires Node.js 20 or newer; no packages need to be installed.

```sh
npm start
```

Open http://localhost:8443. Camera access on `localhost` is allowed without HTTPS. If your browser asks, allow camera access.

## Open on your iPhone over Wi-Fi

An iPhone requires a **trusted HTTPS connection** for camera access to a LAN address. Merely visiting the computer's HTTP address or accepting an untrusted certificate is not enough. One straightforward development setup is [mkcert](https://github.com/FiloSottile/mkcert). Both devices must be on the same network, and the computer's firewall must allow incoming TCP connections on port 8443.

1. Find your computer's LAN IPv4 address, for example `192.168.1.42`. Use your actual address in all the commands and URLs below.
2. Install mkcert on the computer following its instructions, then run:

   ```sh
   mkcert -install
   mkdir -p certs
   mkcert -key-file certs/local-key.pem -cert-file certs/local-cert.pem 192.168.1.42 localhost 127.0.0.1
   TLS_KEY=certs/local-key.pem TLS_CERT=certs/local-cert.pem npm start
   ```

3. Install the mkcert **root CA certificate** on your iPhone: find it using `mkcert -CAROOT`, transfer only the `rootCA.pem` certificate to the iPhone, and install the downloaded profile in Settings. Then enable full trust for it under **Settings → General → About → Certificate Trust Settings**. Never transfer or share `rootCA-key.pem`; it is the CA's private key. See [mkcert's mobile instructions](https://github.com/FiloSottile/mkcert#mobile-devices) and [Apple's certificate trust instructions](https://support.apple.com/en-us/102390).
4. Open `https://192.168.1.42:8443` in Safari on your iPhone, replacing the address with yours. Grant camera access. Safari's Share → Add to Home Screen can install the app as a standalone web app.

If your computer's IP changes, generate a new certificate for the new address. An HTTPS tunnel with a trusted public certificate is another option, but check its privacy and access settings before using one. Remove trust in the development CA from the phone when you no longer need it.

## Use

1. Connect your AirPods. Choose an audio file and tap **Camera**. Use the adjacent play button to preview the song from around 30%; tap it again to stop.
2. Choose the front or back camera. The front camera can be mirrored; this setting applies to the preview and saved video. Tap **Record**, perform, and tap **Stop recording**. Recording starts the song from its beginning.
3. Play the preview. Open **Music timing** and drag the slider toward **Music earlier** or **Music later** while it plays; this moves the soundtrack relative to the captured video, rather than seeking to a fixed position in the song. The range is ±200 milliseconds in 10 ms steps. At a boundary where the chosen offset would require audio before the song begins or after it ends, that part will be silent.
4. Tap **Save video**. The app plays through the take to render the export in real time. Keep the screen awake and this page in the foreground. When finished, use the browser's download/share controls to save the file to Photos. The generated format depends on browser support.
5. Tap **Record again** to make another take with the same song and timing setting.

For a quick sync check, record yourself clapping or making a visible gesture on a beat, then adjust while reviewing. Bluetooth latency, browser scheduling and long recordings can affect alignment; test short clips on your hardware first. The preview adjustment is approximate and the recording's starting alignment is measured in the browser, not calibrated against the actual AirPods output. This prototype does not guarantee frame-accurate sync, and the export may differ from preview due to iOS browser media limitations.

## Limitations

- Tested programmatically only; camera, Bluetooth latency, real-time export, background behavior, and saving to Photos require testing on actual iPhone hardware.
- iOS Safari support for `MediaRecorder`, canvas capture and simultaneous audio routing varies by version. Errors are shown in the app. There is no native-app fallback yet.
- Export takes the length of the recording and can consume substantial memory and battery. Do not lock the screen, switch apps, or seek/pause during export.
- Files and takes are not persisted. Imported songs are not included in the offline cache. The slider is reset when the page reloads.
- Recordings contain the song only, without microphone sound. The song starts at its beginning; choosing a starting point, persistent projects, and automatic Bluetooth latency measurement are not implemented.

## Jetson deployment

On the Jetson, the static files are in `~/recordance/public` and the `recordance` Docker container serves them at `http://127.0.0.1:8787`. Docker's `unless-stopped` restart policy brings it back after reboot. A Cloudflare Tunnel connector running on the Jetson can route `recordance.pigeo.online` to that local HTTP address. The connector must be installed and authenticated separately using Cloudflare's tunnel instructions; do not put its token in this repository. The hostname alone does not start a connector.

To update an existing deployment from a local checkout, copy `public/` to `~/recordance/` on the Jetson; the container mounts that directory read-only, so it serves updated files without rebuilding. The repository's Node server is used for local development, whereas the Jetson container uses an unprivileged Nginx server with a read-only filesystem.

Camera quality controls request the selected resolution and frame rate; the browser may choose different settings, which are shown when available. Export uses the recorded dimensions and requests up to the captured frame rate, but browser and device performance may reduce the final frame rate.
