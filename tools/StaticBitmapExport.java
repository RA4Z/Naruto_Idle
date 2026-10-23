import com.jpexs.decompiler.flash.SWF;
import com.jpexs.decompiler.flash.tags.base.ImageTag;
import java.nio.file.*;
import java.io.*;
import javax.imageio.ImageIO;

/** Decode one named bitmap tag statically. No player, AVM or ActionScript. */
public final class StaticBitmapExport {
    public static void main(String[] args) throws Exception {
        if(args.length!=3)throw new IllegalArgumentException("source.swf symbolId output.png");
        Path source=Path.of(args[0]),output=Path.of(args[2]);
        if(Files.size(source)>32_000_000)throw new IllegalArgumentException("Source byte budget exceeded");
        try(InputStream input=Files.newInputStream(source)) {
            SWF swf=new SWF(input,false);
            if(!(swf.getCharacter(Integer.parseInt(args[1])) instanceof ImageTag bitmap))throw new IllegalArgumentException("Not an image symbol");
            var size=bitmap.getImageDimension();
            if(size.width<1||size.height<1||size.width>8192||size.height>8192||(long)size.width*size.height>16_000_000)throw new IllegalArgumentException("Bitmap pixel budget exceeded");
            Files.createDirectories(output.toAbsolutePath().getParent());
            var image=bitmap.getImageCached().getBufferedImage();
            ImageIO.write(image,"PNG",output.toFile());image.flush();
            System.out.printf("{\"symbolId\":%s,\"width\":%d,\"height\":%d,\"staticOnly\":true}%n",args[1],size.width,size.height);
        }
    }
}
