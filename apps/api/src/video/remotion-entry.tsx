import React from "react";
import { Composition, registerRoot } from "remotion";
import { createDesignDocument } from "@united-technologies/shared/design-document";
import { BrandedVideo } from "./video-composition.js";
import { VIDEO_SIZES, type VideoCompositionProps } from "./types.js";

const baseDocument = createDesignDocument({
  id: "remotion-default",
  title: "",
  format: "video",
  colors: ["#253746", "#C6A477", "#F8F5F0"],
});
const defaultProps: VideoCompositionProps = {
  title: "",
  brandName: "",
  colors: ["#253746", "#C6A477", "#F8F5F0"],
  fontFamily: "Inter",
  document: {
    ...baseDocument,
    pages: [...baseDocument.pages, { ...baseDocument.pages[0]!, id: "remotion-default-end-card", role: "closing" }],
  },
  scenes: [],
  width: VIDEO_SIZES.vertical.width,
  height: VIDEO_SIZES.vertical.height,
  fps: 30,
};

function RemotionRoot() {
  return (
    <>
      {Object.entries(VIDEO_SIZES).map(([id, size]) => (
        <Composition
          key={id}
          id={`Branded-${id}`}
          component={BrandedVideo}
          width={size.width}
          height={size.height}
          fps={30}
          durationInFrames={180}
          defaultProps={{ ...defaultProps, ...size }}
        />
      ))}
    </>
  );
}

registerRoot(RemotionRoot);
