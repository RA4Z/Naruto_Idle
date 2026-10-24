import com.jpexs.decompiler.flash.SWF;
import com.jpexs.decompiler.flash.tags.DefineSpriteTag;
import java.nio.file.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.TreeMap;

/** Metadata probe only: no raster rendering, AVM, scripts or gameplay inference. */
public final class ProbeScenePointData {
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
        if (args.length != 2) throw new IllegalArgumentException("source.swf symbolId");
        Path source = Path.of(args[0]);
        if (Files.size(source) > 32_000_000) throw new IllegalArgumentException("Source byte budget exceeded");
        int id = Integer.parseInt(args[1]);
        try (InputStream input = Files.newInputStream(source)) {
            SWF swf = new SWF(input, false);
            if (!(swf.getCharacter(id) instanceof DefineSpriteTag sprite)) throw new IllegalArgumentException("Not a sprite");
            var timeline = sprite.getTimeline();
            if (timeline.getFrameCount() != 1) throw new IllegalArgumentException("Only one-frame point metadata");
            var bounds = timeline.getDisplayRectWithFilters();
            StringBuilder out = new StringBuilder(String.format(java.util.Locale.ROOT,
                "{\"symbolId\":%d,\"frames\":1,\"fps\":%s,\"rectTwips\":[%d,%d,%d,%d],\"sourceExecution\":false,\"points\":[",
                id, Float.toString(swf.frameRate), bounds.Xmin, bounds.Ymin, bounds.Xmax, bounds.Ymax));
            boolean comma = false;
            for (var row : new TreeMap<>(timeline.getFrame(0).layers).entrySet()) {
                var state = row.getValue();
                if (state.instanceName == null || state.instanceName.isBlank() || state.matrix == null) continue;
                if (comma) out.append(',');
                out.append(String.format(java.util.Locale.ROOT,
                    "{\"frame\":0,\"depth\":%d,\"name\":%s,\"x\":%.8f,\"y\":%.8f}",
                    row.getKey(), quoted(state.instanceName), state.matrix.translateX / 20.0, state.matrix.translateY / 20.0));
                comma = true;
            }
            out.append("]}\n");
            System.out.write(out.toString().getBytes(StandardCharsets.UTF_8));
        }
    }
}
