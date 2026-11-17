import { useEffect, useRef, useState } from "react";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Text, Heading } from "@astryxdesign/core/Text";
import { Button } from "@astryxdesign/core/Button";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Selector } from "@astryxdesign/core/Selector";
import { drawArt } from "./art.mjs";
import { Glyph } from "./Brand";
import { panel, mono, fill } from "./design.mjs";
export function Artwork({
  preset = "orbit",
  title = "",
  seed = 7,
  canvasRef,
  animated = false,
  width = 1280,
  height = 720,
}) {
  const own = useRef();
  const ref = canvasRef || own;
  useEffect(() => {
    let frame;
    let start = performance.now();
    const c = ref.current;
    const ctx = c.getContext("2d");
    const render = (now) => {
      drawArt(ctx, c.width, c.height, (now - start) / 1000, {
        preset,
        title,
        seed,
      });
      if (animated && !matchMedia("(prefers-reduced-motion: reduce)").matches)
        frame = requestAnimationFrame(render);
    };
    render(start);
    return () => cancelAnimationFrame(frame);
  }, [preset, title, seed, animated, ref, width, height]);
  return (
    <canvas
      ref={ref}
      width={width}
      height={height}
      aria-label={`Code-generated ${preset} artwork${title ? ": " + title : ""}`}
      style={{
        width: "100%",
        height: "100%",
        objectFit: "cover",
        display: "block",
      }}
    />
  );
}
export default function CodeStudio({ initialPreset = "orbit" }) {
  const [preset, setPreset] = useState(initialPreset),
    [title, setTitle] = useState(""),
    [ratio, setRatio] = useState("16:9"),
    [seed, setSeed] = useState(7),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(0),
    [error, setError] = useState(""),
    [output, setOutput] = useState(null);
  const canvas = useRef(),
    stop = useRef();
  useEffect(
    () => () => {
      stop.current?.();
    },
    [],
  );
  useEffect(
    () => () => {
      if (output) URL.revokeObjectURL(output.url);
    },
    [output],
  );
  const dims =
    ratio === "9:16"
      ? [720, 1280]
      : ratio === "1:1"
        ? [1080, 1080]
        : [1280, 720];
  function png() {
    const c = document.createElement("canvas");
    [c.width, c.height] = dims;
    drawArt(c.getContext("2d"), ...dims, 0, { preset, title, seed });
    c.toBlob((blob) => {
      if (blob)
        setOutput({
          url: URL.createObjectURL(blob),
          name: "parallax-" + preset + ".png",
          kind: "image",
        });
      else setError("Your browser could not export this image.");
    }, "image/png");
  }
  async function motion() {
    setError("");
    if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) {
      setError(
        "Motion export is unavailable in this browser. PNG export still works.",
      );
      return;
    }
    const mime = [
      "video/mp4;codecs=avc1.42E01E",
      "video/mp4",
      "video/webm;codecs=vp9",
      "video/webm;codecs=vp8",
      "video/webm",
    ].find((t) => MediaRecorder.isTypeSupported(t));
    if (!mime) {
      setError("This browser has no supported video encoder.");
      return;
    }
    const c = document.createElement("canvas");
    [c.width, c.height] = dims;
    const ctx = c.getContext("2d");
    drawArt(ctx, ...dims, 0, { preset, title, seed });
    const stream = c.captureStream(30);
    let recorder, frame, watchdog;
    const chunks = [];
    let interrupted = false,
      done = false;
    try {
      recorder = new MediaRecorder(stream, {
        mimeType: mime,
        videoBitsPerSecond: 6000000,
      });
    } catch {
      stream.getTracks().forEach((t) => t.stop());
      setError("Video encoder could not start. Try a different browser.");
      return;
    }
    function cleanup() {
      cancelAnimationFrame(frame);
      clearTimeout(watchdog);
      stream.getTracks().forEach((t) => t.stop());
      document.removeEventListener("visibilitychange", visibility);
      stop.current = null;
    }
    function finish(cancel = false) {
      if (done) return;
      done = true;
      interrupted = cancel;
      cleanup();
      if (recorder.state !== "inactive") recorder.stop();
    }
    function visibility() {
      if (document.hidden) finish(true);
    }
    recorder.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    recorder.onerror = () => {
      setError("Video encoding failed.");
      finish(true);
    };
    recorder.onstop = () => {
      setBusy(false);
      if (interrupted) {
        setError(
          "Motion export stopped. Keep this tab visible for the six-second render.",
        );
        return;
      }
      if (!chunks.length) {
        setError("The browser returned an empty video.");
        return;
      }
      const blob = new Blob(chunks, { type: mime });
      setOutput({
        url: URL.createObjectURL(blob),
        name:
          "parallax-" +
          preset +
          (mime.startsWith("video/mp4") ? ".mp4" : ".webm"),
        kind: "video",
      });
    };
    document.addEventListener("visibilitychange", visibility);
    stop.current = () => finish(true);
    setBusy(true);
    setProgress(0);
    try {
      recorder.start();
    } catch {
      cleanup();
      setBusy(false);
      setError("Video encoder could not start. PNG export is still available.");
      return;
    }
    const start = performance.now();
    const render = (now) => {
      const elapsed = (now - start) / 1000;
      drawArt(ctx, ...dims, elapsed, { preset, title, seed });
      setProgress(Math.min(100, Math.round((elapsed / 6) * 100)));
      if (elapsed >= 6) finish();
      else frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    watchdog = setTimeout(() => finish(true), 15000);
  }
  return (
    <VStack gap={5}>
      <HStack gap={2} wrap="wrap" vAlign="center" hAlign="between">
        <VStack gap={1}>
          <Heading level={2}>Make it with code.</Heading>
          <Text color="secondary">
            Original procedural graphics. Rendered on your device. Zero API
            calls.
          </Text>
        </VStack>
        <Text type="code" color="accent">
          NO DAILY CAP
        </Text>
      </HStack>
      <VStack style={panel}>
        <VStack
          style={{
            aspectRatio:
              ratio === "9:16"
                ? "9 / 16"
                : ratio === "1:1"
                  ? "1 / 1"
                  : "16 / 9",
            maxHeight: "65dvh",
          }}
        >
          <Artwork
            preset={preset}
            title={title}
            seed={seed}
            canvasRef={canvas}
            animated={!busy}
            width={dims[0]}
            height={dims[1]}
          />
        </VStack>
      </VStack>
      <HStack gap={4} wrap="wrap" vAlign="end">
        <VStack gap={3} style={fill}>
          <TextInput
            label="Title (optional)"
            value={title}
            onChange={(v) => setTitle(v.slice(0, 100))}
            placeholder="MAKE THE UNSEEN."
          />
          <HStack gap={3} wrap="wrap">
            <Selector
              label="Visual system"
              value={preset}
              onChange={setPreset}
              options={[
                { value: "orbit", label: "01 / Orbital" },
                { value: "signal", label: "02 / Signal waves" },
                { value: "mesh", label: "03 / Spatial mesh" },
                { value: "frame", label: "04 / Infinite frames" },
              ]}
            />
            <Selector
              label="Format"
              value={ratio}
              onChange={setRatio}
              options={["16:9", "9:16", "1:1"]}
            />
          </HStack>
        </VStack>
        <HStack gap={2} wrap="wrap">
          <Button
            label="New variation"
            onClick={() => setSeed((s) => s + 1)}
            isDisabled={busy}
          />
          <Button
            label="Export PNG"
            icon={<Glyph name="download" />}
            onClick={png}
            isDisabled={busy}
          />
          <Button
            label={busy ? `Rendering ${progress}%` : "Render 6s motion"}
            variant="primary"
            icon={<Glyph name="video" />}
            onClick={motion}
            isDisabled={busy}
          />
        </HStack>
      </HStack>
      {busy && (
        <Text role="status" color="secondary">
          Rendering on your device. Keep this tab open and visible.
        </Text>
      )}
      {error && (
        <Text role="alert" color="negative">
          {error}
        </Text>
      )}
      {output && (
        <HStack gap={3} wrap="wrap" style={panel} padding={3}>
          <Text>Your {output.kind} is ready.</Text>
          <a href={output.url} download={output.name}>
            Download {output.name}
          </a>
        </HStack>
      )}
      <Text type="supporting" color="secondary">
        Exports download to your device and are not saved in the AI library.
        These are designed graphics and motion loops; photorealistic generation
        uses your provider allowance.
      </Text>
    </VStack>
  );
}
