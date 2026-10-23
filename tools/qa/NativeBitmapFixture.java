import com.jpexs.decompiler.flash.SWF;
import com.jpexs.decompiler.flash.tags.DefineBitsLossless2Tag;
import com.jpexs.decompiler.flash.tags.ShowFrameTag;
import java.awt.image.BufferedImage;
import java.io.*;
import java.nio.file.*;
import javax.imageio.ImageIO;

/** Synthetic graphics-only SWF for known pixel checks. Contains no source code. */
public final class NativeBitmapFixture {
    public static void main(String[] args) throws Exception {
        SWF swf=new SWF();swf.frameRate=24;swf.frameCount=1;
        int[] colors={0xffff0000,0xff0000ff};
        for(int i=0;i<colors.length;i++) {
            BufferedImage image=new BufferedImage(3,3,BufferedImage.TYPE_INT_ARGB);
            for(int y=0;y<3;y++)for(int x=0;x<3;x++)image.setRGB(x,y,colors[i]);
            ByteArrayOutputStream bytes=new ByteArrayOutputStream();ImageIO.write(image,"PNG",bytes);
            DefineBitsLossless2Tag bitmap=new DefineBitsLossless2Tag(swf);bitmap.characterID=i+1;bitmap.setImage(bytes.toByteArray());swf.addTag(bitmap);
        }
        swf.addTag(new ShowFrameTag(swf));swf.updateCharacters();
        try(OutputStream output=Files.newOutputStream(Path.of(args[0]))){swf.saveTo(output);}
    }
}
