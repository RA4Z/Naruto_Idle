import com.jpexs.decompiler.flash.SWF;
import com.jpexs.decompiler.flash.tags.DefineSpriteTag;
import java.nio.file.*;
import java.io.*;

/** Metadata only. No raster allocation, AVM execution or altered source bounds. */
public final class ProbeSourceBounds {
    public static void main(String[] args) throws Exception {
        if(args.length!=2)throw new IllegalArgumentException("source.swf comma-separated-symbol-ids");
        Path path=Path.of(args[0]);
        if(Files.size(path)>32_000_000)throw new IllegalArgumentException("Metadata source byte budget exceeded");
        try(InputStream input=Files.newInputStream(path)) {
            SWF swf=new SWF(input,false);StringBuilder out=new StringBuilder("{\"sourceExecution\":false,\"rasterRendered\":false,\"rows\":[");boolean comma=false;
            for(String value:args[1].split(",")) {
                int id=Integer.parseInt(value);
                if(!(swf.getCharacter(id) instanceof DefineSpriteTag sprite))throw new IllegalArgumentException("Not an exact sprite");
                var timeline=sprite.getTimeline();var r=timeline.getDisplayRectWithFilters();
                long w=(long)Math.ceil((r.Xmax-(double)r.Xmin)/20.0)+1,h=(long)Math.ceil((r.Ymax-(double)r.Ymin)/20.0)+1;
                if(comma)out.append(',');comma=true;
                out.append("{\"symbolId\":"+id+",\"frames\":"+timeline.getFrameCount()+",\"fps\":"+swf.frameRate
                    +",\"rectTwips\":["+r.Xmin+","+r.Ymin+","+r.Xmax+","+r.Ymax+"],\"width\":"+w+",\"height\":"+h
                    +",\"pixels\":"+w*h+",\"rasterRendered\":false}");
            }
            System.out.println(out.append("]}"));
        }
    }
}
