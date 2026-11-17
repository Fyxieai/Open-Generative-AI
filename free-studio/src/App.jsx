import { useCallback, useEffect, useRef, useState } from "react";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { Text, Heading } from "@astryxdesign/core/Text";
import { Button } from "@astryxdesign/core/Button";
import { TextInput } from "@astryxdesign/core/TextInput";
import { TextArea } from "@astryxdesign/core/TextArea";
import { Selector } from "@astryxdesign/core/Selector";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Grid } from "@astryxdesign/core/Grid";
import { useMediaQuery } from "@astryxdesign/core/hooks";
import Brand, { Logo, Glyph } from "./Brand";
import StudioFrame from "./StudioFrame";
import CodeStudio, { Artwork } from "./CodeStudio";
import {
  panel,
  fill,
  mono,
  media,
  ink,
  surface,
  line,
  muted,
  accent,
} from "./design.mjs";

const PROVIDERS = {
  novai: {
    name: "NovAI",
    url: "https://aiapi-pro.com/free/index.html",
    note: "10 shared free-model calls a day, including up to 5 five-second videos. Resets at midnight UTC+8. Free outputs carry a watermark.",
  },
  agnes: {
    name: "Agnes AI",
    url: "https://platform.agnes-ai.com/",
    note: "Promotional $0 Flash models. Confirm your account price and an expiry before enabling. Availability and limits depend on your account.",
  },
  freellmapi: {
    name: "FreeLLMAPI",
    url: "https://github.com/tashfeenahmed/freellmapi",
    note: "Disabled in this build. Upstream routing cannot guarantee which provider receives a submission. Use the direct adapters above.",
  },
};
async function api(path, options = {}) {
  const res = await fetch("/api" + path, {
    credentials: "same-origin",
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status}).`);
    err.status = res.status;
    throw err;
  }
  return data;
}
const border = { borderBottom: "var(--studio-border-width) solid " + line };
function Modal({ title, subtitle, onClose, children }) {
  return (
    <Dialog
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      width={760}
      purpose="form"
    >
      <DialogHeader
        title={title}
        subtitle={subtitle}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      />
      <VStack padding={5} gap={4}>
        {children}
      </VStack>
    </Dialog>
  );
}
function Connections({ status, onClose, refresh, notify }) {
  const [id, setId] = useState("novai"),
    [key, setKey] = useState(""),
    [until, setUntil] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const p = PROVIDERS[id],
    saved = status?.providers?.find((p) => p.id === id);
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (id === "agnes" && (!until || !Number.isFinite(Date.parse(until))))
        throw new Error("Choose when to stop using this free promotion.");
      await api("/providers/" + id, {
        method: "POST",
        body: JSON.stringify({
          apiKey: key.trim(),
          ...(id === "agnes"
            ? { freeUntil: new Date(until).toISOString() }
            : {}),
        }),
      });
      setKey("");
      await refresh();
      notify("Connection saved. Your key is encrypted on the server.");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    setBusy(true);
    try {
      await api("/providers/" + id, { method: "DELETE" });
      await refresh();
      notify("Provider disconnected.");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Connect your engines"
      subtitle="Your keys. Reviewed free models. No automatic paid fallback."
      onClose={onClose}
    >
      <HStack gap={2} wrap="wrap">
        {Object.entries(PROVIDERS).map(([k, p]) => (
          <Button
            key={k}
            label={p.name}
            variant={id === k ? "primary" : "secondary"}
            onClick={() => {
              setId(k);
              setKey("");
              setUntil("");
              setError("");
            }}
          />
        ))}
      </HStack>
      <Text>{p.note}</Text>
      {id === "novai" && status?.quotas?.novai && (
        <Quota quota={status.quotas.novai} />
      )}
      <Button
        label={"Open " + p.name + " ↗"}
        href={p.url}
        target="_blank"
        rel="noreferrer"
        variant="ghost"
      />
      {id !== "freellmapi" && (
        <VStack as="form" onSubmit={save} gap={4}>
          <TextInput
            label={saved?.configured ? "Replace API key" : "API key"}
            type="password"
            value={key}
            onChange={setKey}
            autoComplete="off"
            hasSpellCheck={false}
            description="Encrypted on the server. Never returned to your browser."
          />
          {id === "agnes" && (
            <VStack gap={2}>
              <Text as="label" htmlFor="promotion-end" type="label">
                I verified $0 pricing; stop free access at:
              </Text>
              <input
                id="promotion-end"
                type="datetime-local"
                value={until}
                onChange={(e) => setUntil(e.target.value)}
                required
                style={{
                  background: ink,
                  color: "var(--color-text-primary)",
                  padding: "var(--spacing-3)",
                  border: "var(--studio-border-width) solid " + line,
                  borderRadius: "var(--radius-control)",
                }}
              />
              <Text type="supporting" color="secondary">
                Use the earlier of the provider’s promotion end or the next 24
                hours. This confirmation cannot guarantee future provider
                prices.
              </Text>
              {saved?.freeUntil && (
                <Text type="supporting">
                  Current confirmation expires{" "}
                  {new Date(saved.freeUntil).toLocaleString()}.
                </Text>
              )}
            </VStack>
          )}
          {error && <Text role="alert">{error}</Text>}
          <HStack gap={2}>
            <Button
              type="submit"
              label="Save connection"
              variant="primary"
              isLoading={busy}
              isDisabled={!key.trim() || (id === "agnes" && !until)}
            />
            {saved?.configured && (
              <Button label="Disconnect" onClick={remove} isDisabled={busy} />
            )}
          </HStack>
        </VStack>
      )}
    </Modal>
  );
}
function Quota({ quota: q }) {
  return (
    <VStack gap={2} style={panel} padding={3}>
      <HStack hAlign="between" wrap="wrap" gap={2}>
        <Text type="label">NovAI daily allowance</Text>
        <Text type="code">
          {q.totalRemaining} / {q.totalLimit} calls left
        </Text>
      </HStack>
      <Text type="supporting" color="secondary">
        Up to {Math.min(q.videoRemaining, q.totalRemaining)} videos remaining
        within those calls. Resets{" "}
        {new Date(q.resetAt).toLocaleTimeString(undefined, {
          hour: "numeric",
          minute: "2-digit",
        })}{" "}
        your time.
      </Text>
      <Text type="supporting" color="secondary">
        Counts submissions from this studio. Failed calls may consume allowance;
        other account usage is not included.
      </Text>
    </VStack>
  );
}
function Login({ onLogin }) {
  const [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/login", {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      setPassword("");
      onLogin();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <VStack
      minHeight="100dvh"
      padding={6}
      vAlign="center"
      hAlign="center"
      style={{ background: ink }}
    >
      <VStack maxWidth={440} width="100%" gap={6}>
        <Brand />
        <Heading level={1}>Beyond the ordinary.</Heading>
        <Text color="secondary">
          Your private image, video, and code studio.
        </Text>
        <VStack as="form" gap={4} onSubmit={submit}>
          <TextInput
            label="Studio password"
            type="password"
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
            hasAutoFocus
          />
          {error && <Text role="alert">{error}</Text>}
          <Button
            type="submit"
            label="Enter Parallax"
            variant="primary"
            isLoading={busy}
            isDisabled={!password}
          />
        </VStack>
      </VStack>
    </VStack>
  );
}
function JobCard({ job, onOpen }) {
  return (
    <VStack
      as="button"
      onClick={() => onOpen(job)}
      gap={0}
      aria-label={`${job.kind}: ${job.prompt}. ${job.status}`}
      style={{
        ...panel,
        textAlign: "left",
        cursor: "pointer",
        color: "var(--color-text-primary)",
        padding: 0,
      }}
    >
      <VStack
        hAlign="center"
        vAlign="center"
        style={{ aspectRatio: "4 / 3", background: ink, overflow: "hidden" }}
      >
        {job.status === "completed" && job.mediaUrl ? (
          job.kind === "video" ? (
            <video
              src={job.mediaUrl}
              muted
              playsInline
              preload="metadata"
              style={media}
            />
          ) : (
            <img
              src={job.mediaUrl}
              alt={job.prompt}
              loading="lazy"
              style={media}
            />
          )
        ) : (
          <VStack gap={2} hAlign="center" padding={4}>
            <Glyph name={job.kind} size={28} />
            <Text type="supporting">{job.status}</Text>
          </VStack>
        )}
      </VStack>
      <VStack padding={3} gap={1}>
        <Text maxLines={2}>{job.prompt}</Text>
        <Text type="supporting" color="secondary">
          {PROVIDERS[job.provider]?.name} / {job.kind} / {job.status}
        </Text>
      </VStack>
    </VStack>
  );
}
function Detail({ job, onClose, refresh, reuse, notify }) {
  const [deleting, setDeleting] = useState(false);
  async function action(method, path) {
    try {
      await api("/jobs/" + job.id + path, { method });
      await refresh();
      onClose();
    } catch (e) {
      notify(e.message);
    }
  }
  return (
    <Modal
      title="Your creation"
      subtitle={`${job.kind} / ${job.status} / ${PROVIDERS[job.provider]?.name}`}
      onClose={onClose}
    >
      {job.status === "completed" && job.mediaUrl ? (
        <VStack style={{ ...panel, maxHeight: "55dvh" }}>
          {job.kind === "video" ? (
            <video src={job.mediaUrl} controls playsInline style={media} />
          ) : (
            <img src={job.mediaUrl} alt={job.prompt} style={media} />
          )}
        </VStack>
      ) : (
        <Text>{job.error || "Your job is " + job.status + "."}</Text>
      )}
      <Text>{job.prompt}</Text>
      <HStack gap={2} wrap="wrap">
        <Button label="Reuse prompt" onClick={() => reuse(job)} />
        {job.mediaUrl && (
          <Button
            label="Download"
            href={job.mediaUrl + "?download=1"}
            variant="primary"
            icon={<Glyph name="download" />}
          />
        )}
        {["queued", "running"].includes(job.status) ? (
          <Button
            label="Cancel generation"
            onClick={() => action("POST", "/cancel")}
          />
        ) : deleting ? (
          <>
            <Text>Delete permanently?</Text>
            <Button
              label="Delete creation"
              variant="destructive"
              onClick={() => action("DELETE", "")}
            />
            <Button label="Keep it" onClick={() => setDeleting(false)} />
          </>
        ) : (
          <Button
            label="Delete"
            onClick={() => setDeleting(true)}
            variant="ghost"
          />
        )}
      </HStack>
    </Modal>
  );
}
export default function App() {
  const [session, setSession] = useState(null),
    [status, setStatus] = useState(null),
    [jobs, setJobs] = useState([]),
    [page, setPage] = useState("image"),
    [prompt, setPrompt] = useState(""),
    [modelId, setModelId] = useState(""),
    [ratio, setRatio] = useState("1:1"),
    [duration, setDuration] = useState(5),
    [connections, setConnections] = useState(false),
    [selected, setSelected] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [filter, setFilter] = useState("all"),
    [look, setLook] = useState("orbit");
  const pending = useRef(null),
    toastTimer = useRef();
  const compact = useMediaQuery("(max-width: 760px)");
  const kind = page === "video" ? "video" : "image";
  const active = jobs.filter((j) => ["queued", "running"].includes(j.status));
  const models = (status?.models || []).filter(
    (m) => m.kind === kind && m.provider !== "freellmapi",
  );
  const model =
    models.find((m) => m.id === modelId) ||
    models.find((m) => m.available) ||
    models[0];
  const latest = jobs.find((j) => j.kind === kind && j.status === "completed");
  const refresh = useCallback(async () => {
    const [s, j] = await Promise.all([api("/status"), api("/jobs")]);
    setStatus(s);
    setJobs(j.jobs || []);
    setSelected((c) =>
      c ? (j.jobs || []).find((j) => j.id === c.id) || null : null,
    );
  }, []);
  const load = useCallback(async () => {
    try {
      const s = await api("/session");
      setSession(s);
      if (s.authenticated) await refresh();
    } catch (e) {
      setError(e.message);
    }
  }, [refresh]);
  useEffect(() => {
    load();
    return () => clearTimeout(toastTimer.current);
  }, [load]);
  useEffect(() => {
    if (!session?.authenticated) return;
    const timer = setInterval(
      () =>
        refresh().catch((e) => {
          if (e.status === 401) setSession({ authenticated: false });
        }),
      active.length ? 2500 : 12000,
    );
    return () => clearInterval(timer);
  }, [session?.authenticated, active.length, refresh]);
  useEffect(() => {
    if (!model) return;
    if (!model.aspectRatios.includes(ratio)) setRatio(model.aspectRatios[0]);
    if (model.durations.length && !model.durations.includes(duration))
      setDuration(model.durations[0]);
  }, [model, ratio, duration]);
  function notify(s) {
    setToast(s);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 6000);
  }
  function navigate(p) {
    setPage(p);
    setModelId("");
    setError("");
  }
  async function generate() {
    setError("");
    if (!model?.available) {
      setConnections(true);
      return;
    }
    const payload = {
      modelId: model.id,
      prompt: prompt.trim(),
      aspectRatio: ratio,
      ...(kind === "video" ? { duration: Number(duration) } : {}),
    };
    const serialized = JSON.stringify(payload);
    if (!pending.current || pending.current.payload !== serialized)
      pending.current = { key: crypto.randomUUID(), payload: serialized };
    setBusy(true);
    try {
      const data = await api("/jobs", {
        method: "POST",
        headers: { "Idempotency-Key": pending.current.key },
        body: serialized,
      });
      pending.current = null;
      setJobs((current) => [
        data.job,
        ...current.filter((j) => j.id !== data.job.id),
      ]);
      notify("Generation queued.");
      refresh().catch(() =>
        notify("Generation accepted. Status will refresh shortly."),
      );
    } catch (e) {
      if (e.status && e.status < 500) pending.current = null;
      setError(
        e.status
          ? e.message
          : "Connection interrupted. Retry with the same settings to check this submission safely.",
      );
    } finally {
      setBusy(false);
    }
  }
  function reuse(j) {
    setPage(j.kind);
    setPrompt(j.prompt);
    setModelId(j.modelId);
    setRatio(j.aspectRatio);
    setDuration(j.duration || 5);
    setSelected(null);
  }
  async function logout() {
    try {
      await api("/logout", { method: "POST" });
      setSession({ authenticated: false });
      setJobs([]);
      setStatus(null);
    } catch (e) {
      notify(e.message);
    }
  }
  if (!session)
    return (
      <VStack minHeight="100dvh" vAlign="center" hAlign="center" gap={3}>
        <Logo size={50} />
        <Text>{error || "Entering Parallax…"}</Text>
        {error && <Button label="Retry" onClick={load} />}
      </VStack>
    );
  if (!session.authenticated) return <Login onLogin={load} />;
  const heading =
    page === "gallery"
      ? "Your universe."
      : page === "code"
        ? "Built from possibility."
        : kind === "video"
          ? "Ideas in motion."
          : "Make the unseen.";
  return (
    <VStack minHeight="100dvh" gap={0} style={{ background: ink }}>
      <HStack
        as="header"
        paddingInline={compact ? 3 : 6}
        paddingBlock={4}
        hAlign="between"
        vAlign="center"
        gap={3}
        style={{
          ...border,
          position: "sticky",
          top: 0,
          zIndex: 10,
          background: ink,
        }}
      >
        <Brand />
        <HStack gap={1}>
          {!compact && (
            <Text type="code" color="secondary">
              PERSONAL CREATIVE ENGINE
            </Text>
          )}
          <Button
            label="Connections"
            variant="ghost"
            size="sm"
            icon={<Glyph name="plug" />}
            isIconOnly={compact}
            onClick={() => setConnections(true)}
          />
          {!session.localMode && (
            <Button
              label="Lock studio"
              size="sm"
              variant="ghost"
              isIconOnly
              icon={<Glyph name="lock" />}
              onClick={logout}
            />
          )}
        </HStack>
      </HStack>
      <HStack gap={0} vAlign="start" style={{ flex: 1 }}>
        <VStack
          as="nav"
          aria-label="Studio navigation"
          padding={compact ? 1 : 2}
          gap={3}
          style={{
            position: "sticky",
            top: "var(--studio-header)",
            minHeight: "calc(100dvh - var(--studio-header))",
            width: compact ? "var(--studio-rail-small)" : "var(--studio-rail)",
            borderRight: "var(--studio-border-width) solid " + line,
            flexShrink: 0,
          }}
        >
          {[
            { id: "image", name: "Image studio", icon: "image" },
            { id: "video", name: "Video studio", icon: "video" },
            { id: "code", name: "Code assets", icon: "code" },
            { id: "gallery", name: "Your library", icon: "grid" },
          ].map((item) => (
            <VStack key={item.id} gap={1} hAlign="center">
              <Button
                label={item.name}
                isIconOnly
                icon={<Glyph name={item.icon} size={21} />}
                variant={page === item.id ? "primary" : "ghost"}
                onClick={() => navigate(item.id)}
                tooltip={item.name}
              />
              {!compact && (
                <Text
                  type="supporting"
                  style={{
                    fontSize: "var(--studio-nav-size)",
                    textAlign: "center",
                  }}
                >
                  {item.id === "gallery"
                    ? "Library"
                    : item.id === "code"
                      ? "Code"
                      : item.id === "video"
                        ? "Video"
                        : "Image"}
                </Text>
              )}
            </VStack>
          ))}
          <VStack style={{ flex: 1 }} />
          <Button
            label="Free model limits"
            isIconOnly
            icon={<Glyph name="shield" />}
            tooltip="Free model limits"
            variant="ghost"
            onClick={() => setConnections(true)}
          />
        </VStack>
        <VStack
          style={{ ...fill, minHeight: "calc(100dvh - var(--studio-header))" }}
        >
          <StudioFrame>
            <HStack wrap="wrap" gap={3} vAlign="center" hAlign="between">
              <VStack gap={1}>
                <Text type="code" color="secondary">
                  PARALLAX /{" "}
                  {page === "gallery"
                    ? "LIBRARY"
                    : page === "code"
                      ? "CODE LAB"
                      : kind.toUpperCase() + " STUDIO"}
                </Text>
                <Heading
                  level={1}
                  style={{
                    fontSize: "var(--studio-heading-size)",
                    letterSpacing: "-.04em",
                  }}
                >
                  {heading}
                </Heading>
              </VStack>
              <HStack gap={2} vAlign="center">
                <Glyph name="shield" size={14} />
                <Text type="supporting" color="secondary">
                  {active.length
                    ? active.length + " jobs in progress"
                    : "Private workspace"}
                </Text>
              </HStack>
            </HStack>
            {page === "code" ? (
              <CodeStudio initialPreset={look} />
            ) : page === "gallery" ? (
              <VStack gap={5}>
                <HStack gap={2} wrap="wrap">
                  {["all", "image", "video"].map((f) => (
                    <Button
                      label={
                        f === "all"
                          ? "All creations"
                          : f === "image"
                            ? "Images"
                            : "Videos"
                      }
                      variant={filter === f ? "primary" : "secondary"}
                      key={f}
                      onClick={() => setFilter(f)}
                    />
                  ))}
                </HStack>
                {jobs.filter((j) => filter === "all" || j.kind === filter)
                  .length ? (
                  <Grid columns={{ minWidth: 240, max: 4 }} gap={4}>
                    {jobs
                      .filter((j) => filter === "all" || j.kind === filter)
                      .map((j) => (
                        <JobCard key={j.id} job={j} onOpen={setSelected} />
                      ))}
                  </Grid>
                ) : (
                  <VStack padding={10} gap={3} hAlign="center" style={panel}>
                    <Glyph name="grid" size={34} />
                    <Heading level={2}>
                      A universe starts with one idea.
                    </Heading>
                    <Text color="secondary">
                      Your AI generations will appear here.
                    </Text>
                    <Button
                      label="Create an image"
                      onClick={() => navigate("image")}
                    />
                  </VStack>
                )}
              </VStack>
            ) : (
              <VStack gap={5}>
                <VStack
                  style={{
                    ...panel,
                    position: "relative",
                    minHeight: compact
                      ? "var(--studio-canvas-small)"
                      : "var(--studio-canvas)",
                    isolation: "isolate",
                    background: ink,
                  }}
                >
                  {latest ? (
                    <VStack
                      hAlign="center"
                      vAlign="center"
                      style={{ height: "var(--studio-canvas)" }}
                    >
                      {kind === "video" ? (
                        <video
                          src={latest.mediaUrl}
                          controls
                          playsInline
                          style={media}
                        />
                      ) : (
                        <img
                          src={latest.mediaUrl}
                          alt={latest.prompt}
                          style={media}
                        />
                      )}
                    </VStack>
                  ) : (
                    <>
                      <VStack
                        aria-hidden="true"
                        style={{ position: "absolute", inset: 0 }}
                      >
                        <Artwork preset={look} animated />
                      </VStack>
                      <VStack
                        gap={5}
                        padding={compact ? 5 : 8}
                        vAlign="between"
                        style={{
                          zIndex: 1,
                          minHeight: compact
                            ? "var(--studio-canvas-small)"
                            : "var(--studio-canvas)",
                          background: "var(--studio-hero-scrim)",
                        }}
                      >
                        <HStack gap={2} vAlign="center">
                          <Glyph name="spark" size={16} />
                          <Text type="code">
                            IMAGINATION HAS A NEW DIMENSION
                          </Text>
                        </HStack>
                        <VStack gap={3} maxWidth={compact ? "100%" : "70%"}>
                          <Heading
                            level={2}
                            style={{
                              fontSize: "var(--studio-hero-type)",
                              letterSpacing: "-.075em",
                              lineHeight: 0.93,
                              fontWeight: 500,
                            }}
                          >
                            BEYOND
                            <br />
                            THE FRAME.
                          </Heading>
                          <Text color="secondary">
                            One studio. Image. Motion. Code.
                            <br />
                            Create something that couldn’t exist before.
                          </Text>
                        </VStack>
                        <HStack
                          hAlign="between"
                          vAlign="center"
                          wrap="wrap"
                          gap={2}
                        >
                          <Text type="code" color="secondary">
                            PROCEDURAL ART / NO API USED
                          </Text>
                          <Button
                            label="Open code lab"
                            variant="secondary"
                            size="sm"
                            icon={<Glyph name="arrow" />}
                            onClick={() => navigate("code")}
                          />
                        </HStack>
                      </VStack>
                    </>
                  )}
                </VStack>
                <VStack
                  gap={4}
                  padding={compact ? 4 : 5}
                  style={{
                    ...panel,
                    boxShadow: "var(--studio-composer-shadow)",
                  }}
                >
                  <TextArea
                    label="What do you want to create?"
                    value={prompt}
                    onChange={setPrompt}
                    placeholder={
                      kind === "video"
                        ? "A lone astronaut crosses a violet desert. Low-angle tracking shot, dust drifting in slow motion…"
                        : "A chrome sculpture floating above a violet desert, cinematic light, analog film grain…"
                    }
                    rows={2}
                    htmlMaxLength={4000}
                    maxLength={4000}
                  />
                  <HStack gap={3} wrap="wrap" vAlign="end" hAlign="between">
                    <HStack gap={3} wrap="wrap" style={{ flex: 1 }}>
                      <Selector
                        label="Model"
                        value={model?.id || ""}
                        onChange={setModelId}
                        options={models.map((m) => ({
                          value: m.id,
                          label: m.label,
                          description: m.available
                            ? "Connected"
                            : m.unavailableReason,
                        }))}
                      />
                      <Selector
                        label="Ratio"
                        value={ratio}
                        onChange={setRatio}
                        options={model?.aspectRatios || ["1:1"]}
                      />
                      {kind === "video" && (
                        <Selector
                          label="Length"
                          value={String(duration)}
                          onChange={(v) => setDuration(Number(v))}
                          options={(model?.durations || [5]).map((n) => ({
                            value: String(n),
                            label: n + " seconds",
                          }))}
                        />
                      )}
                    </HStack>
                    <Button
                      label={
                        model?.available
                          ? "Generate " + kind
                          : "Connect an engine"
                      }
                      variant="primary"
                      size="lg"
                      icon={
                        <Glyph name={model?.available ? "spark" : "plug"} />
                      }
                      isLoading={busy}
                      isDisabled={model?.available && !prompt.trim()}
                      onClick={generate}
                    />
                  </HStack>
                  {error && <Text role="alert">{error}</Text>}
                  <HStack gap={2} vAlign="center">
                    <Glyph name="shield" size={14} />
                    <Text type="supporting" color="secondary">
                      {model?.available
                        ? model.freeType === "promotion"
                          ? "Promotional $0 access · expires " +
                            new Date(
                              status.providers.find((p) => p.id === "agnes")
                                ?.freeUntil,
                            ).toLocaleString()
                          : "Free allowance · no automatic paid fallback"
                        : model?.unavailableReason ||
                          "Connect a provider to start."}
                    </Text>
                  </HStack>
                </VStack>
                {status?.quotas?.novai && <Quota quota={status.quotas.novai} />}
                <HStack gap={3} wrap="wrap" hAlign="between" vAlign="center">
                  <Heading level={2}>Your next dimension</Heading>
                  <Text type="supporting" color="secondary">
                    AI when you need it. Code whenever you want.
                  </Text>
                </HStack>
                <Grid columns={{ minWidth: 220, max: 3 }} gap={4}>
                  {[
                    {
                      preset: "orbit",
                      name: "Orbital systems",
                      label: "CODE / NO API",
                      copy: "Sculpt light, depth, and impossible forms.",
                    },
                    {
                      preset: "signal",
                      name: "Signal in motion",
                      label: "MOTION / LOCAL RENDER",
                      copy: "Turn mathematical waves into motion loops.",
                    },
                    {
                      preset: "mesh",
                      name: "Digital terrain",
                      label: "CODE / UNLIMITED EXPORTS",
                      copy: "Make original backgrounds and title cards.",
                    },
                  ].map((a, i) => (
                    <VStack
                      as="button"
                      key={a.preset}
                      aria-label={"Open " + a.name + " in code lab"}
                      gap={0}
                      onClick={() => {
                        setLook(a.preset);
                        navigate("code");
                      }}
                      style={{
                        ...panel,
                        padding: 0,
                        textAlign: "left",
                        cursor: "pointer",
                        color: "var(--color-text-primary)",
                      }}
                    >
                      <VStack style={{ aspectRatio: "16 / 10" }}>
                        <Artwork preset={a.preset} />
                      </VStack>
                      <VStack gap={2} padding={4}>
                        <Text type="code" color="accent">
                          {a.label}
                        </Text>
                        <Heading level={3}>{a.name}</Heading>
                        <Text type="supporting" color="secondary">
                          {a.copy}
                        </Text>
                      </VStack>
                    </VStack>
                  ))}
                </Grid>
                {jobs.length > 0 && (
                  <VStack gap={4}>
                    <HStack hAlign="between">
                      <Heading level={2}>Recent generations</Heading>
                      <Button
                        label="View library ↗"
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate("gallery")}
                      />
                    </HStack>
                    <Grid columns={{ minWidth: 220, max: 4 }} gap={4}>
                      {jobs.slice(0, 4).map((j) => (
                        <JobCard key={j.id} job={j} onOpen={setSelected} />
                      ))}
                    </Grid>
                  </VStack>
                )}
              </VStack>
            )}
            <HStack
              as="footer"
              wrap="wrap"
              gap={2}
              hAlign="between"
              paddingBlock={4}
              style={{ borderTop: "var(--studio-border-width) solid " + line }}
            >
              <Text type="code" color="secondary">
                PARALLAX / MAKE THE UNSEEN
              </Text>
              <Text type="supporting" color="secondary">
                {session.localMode ? "Local preview" : "Private access"} · No
                paid fallback
              </Text>
            </HStack>
          </StudioFrame>
        </VStack>
      </HStack>
      {connections && (
        <Connections
          status={status}
          onClose={() => setConnections(false)}
          refresh={refresh}
          notify={notify}
        />
      )}{" "}
      {selected && (
        <Detail
          job={selected}
          onClose={() => setSelected(null)}
          refresh={refresh}
          reuse={reuse}
          notify={notify}
        />
      )}
      {toast && (
        <VStack
          role="status"
          aria-live="polite"
          padding={4}
          style={{
            ...panel,
            position: "fixed",
            bottom: "var(--spacing-5)",
            right: "var(--spacing-5)",
            maxWidth: "min(90vw, 32rem)",
            zIndex: 20,
            boxShadow: "var(--studio-composer-shadow)",
          }}
        >
          <Text>{toast}</Text>
        </VStack>
      )}
    </VStack>
  );
}
