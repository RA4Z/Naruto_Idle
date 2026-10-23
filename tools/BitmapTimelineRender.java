import com.jpexs.decompiler.flash.SWF;
import com.jpexs.decompiler.flash.tags.*;
import com.jpexs.decompiler.flash.tags.base.ImageTag;
import com.jpexs.decompiler.flash.types.*;
import com.jpexs.decompiler.flash.exporters.commonshape.Matrix;
import java.nio.file.*;
import java.io.*;
import java.util.*;
import javax.imageio.ImageIO;
import javax.xml.parsers.DocumentBuilderFactory;
import javax.xml.XMLConstants;
import org.w3c.dom.*;

/** MME data -> static display list. No source code, player or AVM execution.
 * Tween expansion and color semantics come from the recovered core renderer.
 */
public final class BitmapTimelineRender {
    static double number(Element e,String key,double fallback) {
        return e.hasAttribute(key)?Double.parseDouble(e.getAttribute(key)):fallback;
    }
    static List<Element> children(Element parent,String tag) {
        List<Element> result=new ArrayList<>();
        for(Node n=parent.getFirstChild();n!=null;n=n.getNextSibling())
            if(n instanceof Element e&&e.getTagName().equals(tag))result.add(e);
        return result;
    }
    static final Map<String,Integer> BLENDS=Map.ofEntries(
        Map.entry("normal",BlendMode.NORMAL),Map.entry("layer",BlendMode.LAYER),Map.entry("multiply",BlendMode.MULTIPLY),
        Map.entry("screen",BlendMode.SCREEN),Map.entry("lighten",BlendMode.LIGHTEN),Map.entry("darken",BlendMode.DARKEN),
        Map.entry("difference",BlendMode.DIFFERENCE),Map.entry("add",BlendMode.ADD),Map.entry("subtract",BlendMode.SUBTRACT),
        Map.entry("invert",BlendMode.INVERT),Map.entry("alpha",BlendMode.ALPHA),Map.entry("erase",BlendMode.ERASE),
        Map.entry("overlay",BlendMode.OVERLAY),Map.entry("hardlight",BlendMode.HARDLIGHT));

    public static void main(String[] args) throws Exception {
        if(args.length!=3)throw new IllegalArgumentException("source.swf expanded-spec.xml output-directory");
        Path source=Path.of(args[0]),spec=Path.of(args[1]),out=Path.of(args[2]);
        if(Files.size(source)>32_000_000||Files.size(spec)>8_000_000)throw new IllegalArgumentException("Input byte budget exceeded");
        DocumentBuilderFactory factory=DocumentBuilderFactory.newInstance();
        factory.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING,true);
        factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl",true);
        factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD,"");factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_SCHEMA,"");
        Element root=factory.newDocumentBuilder().parse(spec.toFile()).getDocumentElement();
        Element action=children(root,"action").get(0);List<Element> layers=children(action,"layer");
        int count=Integer.parseInt(root.getAttribute("frameCount"));
        if(count<1||count>480||layers.size()>256)throw new IllegalArgumentException("Timeline budget exceeded");
        try(InputStream input=Files.newInputStream(source)) {
            SWF swf=new SWF(input,false);Map<String,Element> assets=new HashMap<>();long pixels=0;int nextId=swf.getNextCharacterId();
            for(Element asset:children(root,"asset")) {
                int id=Integer.parseInt(asset.getAttribute("symbolId"));
                if(!(swf.getCharacter(id) instanceof ImageTag bitmap))throw new IllegalArgumentException("Not an image symbol: "+id);
                var size=bitmap.getImageDimension();pixels+=(long)size.width*size.height;
                if(size.width>8192||size.height>8192||pixels>32_000_000)throw new IllegalArgumentException("Source bitmap pixel budget exceeded");
                DefineShape3Tag shape=new DefineShape3Tag(swf);shape.shapeId=nextId++;shape.shapeBounds=bitmap.getRect();shape.shapes=bitmap.getShape(bitmap.getRect(),false,3);swf.addTag(shape);asset.setAttribute("renderId",Integer.toString(shape.shapeId));
                assets.put(asset.getAttribute("id"),asset);
            }
            DefineSpriteTag sprite=new DefineSpriteTag(swf);sprite.spriteId=nextId;sprite.frameCount=count;
            for(int frame=0;frame<count;frame++) {
                for(int depth=1;depth<=layers.size();depth++) {
                    RemoveObject2Tag remove=new RemoveObject2Tag(swf);remove.depth=depth;sprite.addTag(remove);
                    Element visible=null;
                    for(Element key:children(layers.get(depth-1),"frame")) {
                        int index=(int)number(key,"index",0),length=(int)number(key,"length",1);
                        if(index<=frame&&frame<index+length)visible=key;
                    }
                    if(visible==null)continue;
                    List<Element> elements=children(visible,"element");
                    if(elements.isEmpty())continue;
                    if(elements.size()!=1||!children(visible,"pointElement").isEmpty())throw new IllegalArgumentException("Ambiguous MME element");
                    Element element=elements.get(0),asset=assets.get(element.getAttribute("assetId"));
                    if(asset==null||element.hasAttribute("extname"))throw new IllegalArgumentException("Unresolved bitmap namespace");
                    double sx=number(element,"scaleX",1),sy=number(element,"scaleY",1),angle=Math.toRadians(number(element,"rotation",0)),co=Math.cos(angle),si=Math.sin(angle);
                    double a=co*sx,b=-si*sy,c=si*sx,d=co*sy;
                    MATRIX matrix=new MATRIX();matrix.hasScale=true;matrix.hasRotate=true;
                    matrix.scaleX=(float)a;matrix.scaleY=(float)d;matrix.rotateSkew0=(float)c;matrix.rotateSkew1=(float)b;
                    matrix.translateX=(int)Math.round(20*(number(element,"x",0)+a*number(asset,"x",0)+b*number(asset,"y",0)));
                    matrix.translateY=(int)Math.round(20*(number(element,"y",0)+c*number(asset,"x",0)+d*number(asset,"y",0)));
                    CXFORMWITHALPHA color=new CXFORMWITHALPHA();color.hasMultTerms=true;color.hasAddTerms=true;
                    color.redMultTerm=color.greenMultTerm=color.blueMultTerm=256;color.alphaMultTerm=(int)Math.round(256*number(element,"alpha",1));
                    if(element.hasAttribute("color")&&!element.getAttribute("color").isEmpty()) {
                        long tint=Long.parseUnsignedLong(element.getAttribute("color"),16);double strength=((tint>>>24)&255)/255.0;
                        color.redMultTerm=color.greenMultTerm=color.blueMultTerm=(int)Math.round(256*(1-strength));
                        color.redAddTerm=(int)Math.round(((tint>>>16)&255)*strength);
                        color.greenAddTerm=(int)Math.round(((tint>>>8)&255)*strength);color.blueAddTerm=(int)Math.round((tint&255)*strength);
                    }
                    String blend=element.hasAttribute("blendMode")?element.getAttribute("blendMode"):"normal";
                    if(!BLENDS.containsKey(blend))throw new IllegalArgumentException("Unknown source blend: "+blend);
                    PlaceObject3Tag place=new PlaceObject3Tag(swf);place.depth=depth;place.characterId=Integer.parseInt(asset.getAttribute("renderId"));
                    place.placeFlagHasCharacter=true;place.matrix=matrix;place.placeFlagHasMatrix=true;place.colorTransform=color;place.placeFlagHasColorTransform=true;
                    place.blendMode=BLENDS.get(blend);place.placeFlagHasBlendMode=true;sprite.addTag(place);
                }
                sprite.addTag(new ShowFrameTag(swf));
            }
            swf.addTag(sprite);swf.updateCharacters();var timeline=sprite.getTimeline();RECT bounds=timeline.getDisplayRectWithFilters();
            long width=(long)Math.ceil((bounds.Xmax-bounds.Xmin)/20.0)+1,height=(long)Math.ceil((bounds.Ymax-bounds.Ymin)/20.0)+1;
            if(width<1||height<1||width>8192||height>8192||width*height>16_000_000)throw new IllegalArgumentException("Canvas budget exceeded");
            Files.createDirectories(out);
            for(int frame=0;frame<count;frame++) {
                var image=SWF.frameToImageGet(timeline,frame,0,null,0,bounds,new Matrix(),null,null,1.0,true,1).getBufferedImage();
                ImageIO.write(image,"PNG",out.resolve(String.format("%04d.png",frame)).toFile());image.flush();
            }
            String metadata=String.format(java.util.Locale.ROOT,"{\"fps\":%s,\"frameCount\":%d,\"rectTwips\":[%d,%d,%d,%d],\"staticOnly\":true,\"renderer\":\"MME-data-JPEXS-26.4.0\",\"colorPrecision\":\"SWF-8.8\"}\n",root.getAttribute("fps"),count,bounds.Xmin,bounds.Ymin,bounds.Xmax,bounds.Ymax);
            Files.writeString(out.resolve("render.json"),metadata);Files.writeString(out.resolve("named-instances.json"),"[]\n");System.out.print(metadata);
        }
    }
}
