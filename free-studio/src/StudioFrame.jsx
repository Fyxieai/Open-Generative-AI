// Adapted from Meta Astryx's AI Chat Landing template (MIT).
import { useMediaQuery } from "@astryxdesign/core/hooks";
import { Layout, LayoutContent, VStack } from "@astryxdesign/core/Layout";
export default function StudioFrame({ children }) {
  const small = useMediaQuery("(max-width: 600px)");
  return (
    <Layout
      height="fill"
      contentWidth={1440}
      padding={small ? 3 : 6}
      content={
        <LayoutContent>
          <VStack gap={8} style={{ minHeight: "100%" }}>
            {children}
          </VStack>
        </LayoutContent>
      }
    />
  );
}
