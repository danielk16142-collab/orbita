import { notFound } from "next/navigation";
import { fakeEnabled } from "@orbita/connectors";
import { Teleprompter } from "@/components/posts/teleprompter";

export default function Preview() {
  if (!fakeEnabled()) notFound();
  const lines = [{ kind: "hook" as const, cue: "", text: "Stop making iced coffee like this." }, { kind: "scene" as const, cue: "0-3s · on screen: Mistake 1", text: "Mistake one: pouring hot espresso straight over ice." }, { kind: "scene" as const, cue: "3-8s", text: "It waters everything down before you take a sip." }, { kind: "cta" as const, cue: "", text: "Follow for more café secrets." }];
  return <Teleprompter lines={lines} hooks={["a", "b"]} hookIndex={0} back="#" />;
}
