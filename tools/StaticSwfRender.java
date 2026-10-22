import com.jpexs.decompiler.flash.SWF;
import com.jpexs.decompiler.flash.tags.DefineSpriteTag;
import com.jpexs.decompiler.flash.timeline.Timeline;
import com.jpexs.decompiler.flash.types.RECT;
import com.jpexs.decompiler.flash.exporters.commonshape.Matrix;
import java.nio.file.*;
import java.io.*;
import javax.imageio.ImageIO;

/** Static display-list renderer only. No Flash player, AVM or ActionScript execution. */
public final class StaticSwfRender {
    public static void main(String[] args) throws Exception {
        if (args.length != 3) throw new IllegalArgumentException("source.swf symbolId outputDirectory");
        Path source=Path.of(args[0]), output=Path.of(args[2]);
        int id=Integer.parseInt(args[1]);
        if (Files.size(source)>32_000_000) throw new IllegalArgumentException("Source byte budget exceeded");
        try(InputStream input=Files.newInputStream(source)) {
            SWF swf=new SWF(input,false);
            if (!(swf.getCharacter(id) instanceof DefineSpriteTag sprite)) throw new IllegalArgumentException("Not a sprite symbol");
            Timeline timeline=sprite.getTimeline();
            RECT bounds=timeline.getDisplayRectWithFilters();
            int count=timeline.getFrameCount();
            long width=(long)Math.ceil((bounds.Xmax-bounds.Xmin)/20.0)+1;
            long height=(long)Math.ceil((bounds.Ymax-bounds.Ymin)/20.0)+1;
            if (count<1||count>480||width<1||height<1||width>8192||height>8192||width*height>16_000_000) throw new IllegalArgumentException("Timeline or canvas budget exceeded");
            Files.createDirectories(output);
            String metadata=String.format(java.util.Locale.ROOT,
                "{\"symbolId\":%d,\"fps\":%s,\"frameCount\":%d,\"rectTwips\":[%d,%d,%d,%d],\"staticOnly\":true,\"renderer\":\"JPEXS-26.4.0\"}\n",
                id,Float.toString(swf.frameRate),count,bounds.Xmin,bounds.Ymin,bounds.Xmax,bounds.Ymax);
            StringBuilder points=new StringBuilder("[");
            for(int frame=0;frame<count;frame++) {
                for(var state:timeline.getFrame(frame).layers.values()) {
                    if(state.instanceName!=null&&!state.instanceName.isBlank()&&state.matrix!=null) {
                        if(points.length()>1)points.append(',');
                        String escaped=state.instanceName.replace("\\","\\\\").replace("\"","\\\"");
                        points.append(String.format(java.util.Locale.ROOT,"{\"frame\":%d,\"name\":\"%s\",\"x\":%.4f,\"y\":%.4f}",frame,escaped,state.matrix.translateX/20.0,state.matrix.translateY/20.0));
                    }
                }
                var image=SWF.frameToImageGet(timeline,frame,0,null,0,bounds,new Matrix(),null,null,1.0,true,1).getBufferedImage();
                ImageIO.write(image,"PNG",output.resolve(String.format("%04d.png",frame)).toFile());
                image.flush();
            }
            Files.writeString(output.resolve("named-instances.json"),points.append(']').toString());
            Files.writeString(output.resolve("render.json"),metadata);
            System.out.print(metadata);
        }
    }
}
