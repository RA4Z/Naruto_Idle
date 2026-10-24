import com.jpexs.decompiler.flash.SWF;
import com.jpexs.decompiler.flash.tags.DefineSpriteTag;
import java.nio.file.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.TreeMap;

/** Independent metadata read only; never renders or runs source scripts. */
public final class ProbeRoleExportData {
    private static String quoted(String value) {
        StringBuilder out = new StringBuilder("\"");
        for (char c : value.toCharArray()) {
            if (c == '\\' || c == '"') out.append('\\').append(c);
            else if (c < 32) out.append(String.format("\\u%04x", (int)c));
            else out.append(c);
        }
        return out.append('"').toString();
    }
    public static void main(String[] args) throws Exception {
        if (args.length != 2) throw new IllegalArgumentException("source.swf comma-separated-symbol-ids");
        Path source = Path.of(args[0]);
        if (Files.size(source) > 32_000_000) throw new IllegalArgumentException("Source byte budget exceeded");
        try (InputStream input = Files.newInputStream(source)) {
            SWF swf = new SWF(input, false);
            StringBuilder out = new StringBuilder("{\"sourceExecution\":false,\"fps\":" + swf.frameRate + ",\"timelines\":[");
            boolean symbolComma = false;
            for (String token : args[1].split(",")) {
                int id = Integer.parseInt(token);
                if (!(swf.getCharacter(id) instanceof DefineSpriteTag sprite)) throw new IllegalArgumentException("Not a sprite");
                var timeline = sprite.getTimeline();
                if (timeline.getFrameCount() > 480) throw new IllegalArgumentException("Frame budget");
                if (symbolComma) out.append(',');
                symbolComma = true;
                out.append("{\"symbolId\":" + id + ",\"frames\":[");
                for (int f = 0; f < timeline.getFrameCount(); f++) {
                    if (f > 0) out.append(',');
                    var frame = timeline.getFrame(f);
                    if (!frame.actions.isEmpty() || !frame.actionContainers.isEmpty()) throw new IllegalArgumentException("Scripted data timeline");
                    out.append("{\"frame\":" + f + ",\"labels\":[");
                    for (int l = 0; l < frame.labels.size(); l++) {
                        if (l > 0) out.append(',');
                        out.append("{\"name\":" + quoted(frame.labels.get(l)) + ",\"namedAnchor\":" + frame.namedAnchors.get(l) + "}");
                    }
                    out.append("],\"points\":[");
                    boolean comma = false;
                    for (var row : new TreeMap<>(frame.layers).entrySet()) {
                        var state = row.getValue();
                        if (state.instanceName == null || state.instanceName.isBlank() || state.matrix == null) continue;
                        if (comma) out.append(',');
                        comma = true;
                        var m = state.matrix;
                        out.append("{\"depth\":" + row.getKey() + ",\"characterId\":" + state.characterId
                            + ",\"name\":" + quoted(state.instanceName) + ",\"ratio\":" + state.ratio
                            + ",\"x\":" + m.translateX / 20.0 + ",\"y\":" + m.translateY / 20.0
                            + ",\"matrix\":{\"scaleXFixed16\":" + (m.hasScale ? m.getScaleXInteger() : 65536)
                            + ",\"scaleYFixed16\":" + (m.hasScale ? m.getScaleYInteger() : 65536)
                            + ",\"rotateSkew0Fixed16\":" + (m.hasRotate ? m.getRotateSkew0Integer() : 0)
                            + ",\"rotateSkew1Fixed16\":" + (m.hasRotate ? m.getRotateSkew1Integer() : 0)
                            + ",\"translateXTwips\":" + m.translateX + ",\"translateYTwips\":" + m.translateY + "}}");
                    }
                    out.append("]}");
                }
                out.append("]}");
            }
            out.append("]}\n");
            System.out.write(out.toString().getBytes(StandardCharsets.UTF_8));
        }
    }
}
